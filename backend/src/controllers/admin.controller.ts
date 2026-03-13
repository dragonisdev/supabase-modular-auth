import type { AdminBulkActionResult, AdminUser } from "@supabase-modular-auth/types";
import type { Request, Response, NextFunction } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import config from "../config/env.js";
import adminAuditService from "../services/admin-audit.service.js";
import SupabaseService from "../services/supabase.service.js";
import { AuthError, ErrorCode, ValidationError } from "../utils/errors.js";
import { successResponse } from "../utils/response.js";
import {
  auditQuerySchema,
  banUserBodySchema,
  bulkActionBodySchema,
  createUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
} from "../validators/admin.validator.js";

const USER_LIST_PAGE_SIZE = 100;
const USER_CACHE_TTL_MS = 60_000;

type UserAppMetadata = {
  role?: string;
  is_admin?: boolean;
  banned?: boolean;
  ban_reason?: string | null;
  ban_expires_at?: string | null;
  [key: string]: unknown;
};

type UserRecord = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  user_metadata?: { username?: string; [key: string]: unknown };
  app_metadata?: UserAppMetadata;
};

type UserListResponseData = {
  users: UserRecord[];
  nextPage: number | null;
  lastPage: number;
  total: number;
};

class UserDirectoryCache {
  private usersById = new Map<string, UserRecord>();
  private nextPage = 1;
  private total = 0;
  private scanComplete = false;
  private lastRefreshAt = 0;
  private fetchInFlight: Promise<void> | null = null;

  private invalidateIfExpired(): void {
    if (Date.now() - this.lastRefreshAt <= USER_CACHE_TTL_MS) {
      return;
    }

    this.usersById.clear();
    this.nextPage = 1;
    this.total = 0;
    this.scanComplete = false;
    this.lastRefreshAt = 0;
  }

  private async fetchNextPage(): Promise<void> {
    if (this.scanComplete) {
      return;
    }

    if (this.fetchInFlight) {
      await this.fetchInFlight;
      return;
    }

    this.fetchInFlight = (async () => {
      const adminClient = SupabaseService.getAdminClient();
      const { data, error } = await adminClient.auth.admin.listUsers({
        page: this.nextPage,
        perPage: USER_LIST_PAGE_SIZE,
      });

      if (error) {
        throw new AuthError("Unable to list users", ErrorCode.SERVICE_UNAVAILABLE);
      }

      const pageData = data as UserListResponseData;
      this.total = pageData.total;

      for (const user of pageData.users) {
        this.usersById.set(user.id, user);
      }

      if (pageData.nextPage === null || this.nextPage >= pageData.lastPage) {
        this.scanComplete = true;
      } else {
        this.nextPage = pageData.nextPage;
      }

      this.lastRefreshAt = Date.now();
    })();

    try {
      await this.fetchInFlight;
    } finally {
      this.fetchInFlight = null;
    }
  }

  async getAllUsersCached(): Promise<{ users: UserRecord[]; total: number }> {
    this.invalidateIfExpired();

    if (!this.scanComplete) {
      await this.fetchNextPage();
      return this.getAllUsersCached();
    }

    return {
      users: Array.from(this.usersById.values()),
      total: this.total,
    };
  }
}

const userDirectoryCache = new UserDirectoryCache();

const normalizeBanState = (
  metadata: UserAppMetadata | undefined,
): { banned: boolean; banExpiresAt: string | null } => {
  if (!metadata || metadata.banned !== true) {
    return { banned: false, banExpiresAt: null };
  }

  const expiresAt = typeof metadata.ban_expires_at === "string" ? metadata.ban_expires_at : null;
  if (!expiresAt) {
    return { banned: true, banExpiresAt: null };
  }

  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    return { banned: true, banExpiresAt: expiresAt };
  }

  return {
    banned: Date.now() < expiryMs,
    banExpiresAt: expiresAt,
  };
};

const mapAdminUser = (user: UserRecord): AdminUser => {
  const appMetadata = user.app_metadata;
  const role = typeof appMetadata?.role === "string" ? appMetadata.role : "user";
  const banState = normalizeBanState(appMetadata);

  return {
    id: user.id,
    email: user.email || "",
    username: typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null,
    role,
    is_admin: typeof appMetadata?.is_admin === "boolean" ? appMetadata.is_admin : role === "admin",
    banned: banState.banned,
    ban_reason: typeof appMetadata?.ban_reason === "string" ? appMetadata.ban_reason : null,
    ban_expires_at: banState.banExpiresAt,
    email_verified: !!user.email_confirmed_at,
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
  };
};

const sortUsers = (
  users: AdminUser[],
  sortBy: string,
  sortDirection: "asc" | "desc",
): AdminUser[] => {
  const direction = sortDirection === "asc" ? 1 : -1;
  const sorted = [...users];

  sorted.sort((left, right) => {
    const leftValue = left[sortBy as keyof AdminUser];
    const rightValue = right[sortBy as keyof AdminUser];

    if (leftValue === rightValue) {
      return 0;
    }

    if (leftValue === null || leftValue === undefined) {
      return 1;
    }

    if (rightValue === null || rightValue === undefined) {
      return -1;
    }

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * direction;
    }

    return leftValue > rightValue ? direction : -direction;
  });

  return sorted;
};

const filterUsers = (
  users: AdminUser[],
  params: { search?: string; filterRole?: string; filterBanned?: boolean },
): AdminUser[] => {
  let result = [...users];

  if (params.search) {
    const term = params.search.toLowerCase();
    result = result.filter(
      (user) =>
        user.email.toLowerCase().includes(term) ||
        (typeof user.username === "string" ? user.username.toLowerCase().includes(term) : false),
    );
  }

  if (params.filterRole) {
    result = result.filter((user) => user.role === params.filterRole);
  }

  if (typeof params.filterBanned === "boolean") {
    result = result.filter((user) => user.banned === params.filterBanned);
  }

  return result;
};

export class AdminController {
  private getUserIdParam(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      throw new ValidationError("User id is required");
    }

    return id;
  }

  private ensureActor(req: AuthenticatedRequest): { actorId: string; actorEmail: string | null } {
    if (!req.user?.id) {
      throw new AuthError("Authentication required");
    }

    return {
      actorId: req.user.id,
      actorEmail: req.user.email || null,
    };
  }

  private async updateBanState(
    userId: string,
    payload: { banned: boolean; reason?: string | null; expiresAt?: string | null },
  ): Promise<UserRecord> {
    const adminClient = SupabaseService.getAdminClient();

    const { data: existingData, error: existingError } =
      await adminClient.auth.admin.getUserById(userId);
    if (existingError || !existingData.user) {
      throw new AuthError("User not found", ErrorCode.USER_NOT_FOUND);
    }

    const existingAppMetadata = (existingData.user.app_metadata || {}) as UserAppMetadata;
    const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...existingAppMetadata,
        banned: payload.banned,
        ban_reason: payload.banned ? payload.reason || "No reason provided" : null,
        ban_expires_at: payload.banned ? payload.expiresAt || null : null,
      },
    });

    if (error || !data.user) {
      throw new AuthError("Failed to update moderation status", ErrorCode.SERVICE_UNAVAILABLE);
    }

    return data.user as UserRecord;
  }

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listUsersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Invalid list users query", parsed.error.issues);
      }

      const { page, limit, search, sortBy, sortDirection, filterRole, filterBanned } = parsed.data;

      const needsFullDataset =
        !!search ||
        !!filterRole ||
        typeof filterBanned === "boolean" ||
        sortBy !== "created_at" ||
        sortDirection !== "desc";

      if (!needsFullDataset) {
        const adminClient = SupabaseService.getAdminClient();
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: limit });
        if (error || !data) {
          throw new AuthError("Unable to list users", ErrorCode.SERVICE_UNAVAILABLE);
        }

        const pageData = data as UserListResponseData;
        const total = pageData.total;
        const totalPages = Math.max(1, pageData.lastPage);

        successResponse(res, "Users listed", {
          items: pageData.users.map(mapAdminUser),
          page,
          limit,
          total,
          totalPages,
        });
        return;
      }

      const { users: allUsers } = await userDirectoryCache.getAllUsersCached();
      const mappedUsers = allUsers.map(mapAdminUser);
      const filteredUsers = filterUsers(mappedUsers, { search, filterRole, filterBanned });
      const sortedUsers = sortUsers(filteredUsers, sortBy, sortDirection);

      const total = sortedUsers.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (page - 1) * limit;

      successResponse(res, "Users listed", {
        items: sortedUsers.slice(offset, offset + limit),
        page,
        limit,
        total,
        totalPages,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = this.getUserIdParam(req);

      const adminClient = SupabaseService.getAdminClient();
      const { data, error } = await adminClient.auth.admin.getUserById(id);
      if (error || !data.user) {
        throw new AuthError("User not found", ErrorCode.USER_NOT_FOUND);
      }

      successResponse(res, "User retrieved", {
        user: mapAdminUser(data.user as UserRecord),
      });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);
      const parsed = createUserBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid create user payload", parsed.error.issues);
      }

      const { email, password, username, role, emailConfirmed } = parsed.data;
      const anonClient = SupabaseService.getClient();
      const adminClient = SupabaseService.getAdminClient();

      // Use standard signup flow so Supabase sends verification email by default.
      const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${config.FRONTEND_URL}/auth/verify`,
          data: username ? { username } : undefined,
        },
      });

      if (signUpError || !signUpData.user) {
        adminAuditService.addLog({
          actorUserId: actor.actorId,
          actorEmail: actor.actorEmail,
          action: "USER_CREATE",
          targetEmail: email,
          status: "failed",
          metadata: { error: signUpError?.message || "unknown" },
          req,
        });
        throw new AuthError("Failed to create user", ErrorCode.SERVICE_UNAVAILABLE);
      }

      const { data, error } = await adminClient.auth.admin.updateUserById(signUpData.user.id, {
        email_confirm: emailConfirmed,
        app_metadata: {
          role,
          is_admin: role === "admin",
          banned: false,
          ban_reason: null,
          ban_expires_at: null,
        },
      });

      if (error || !data.user) {
        adminAuditService.addLog({
          actorUserId: actor.actorId,
          actorEmail: actor.actorEmail,
          action: "USER_CREATE",
          targetEmail: email,
          status: "failed",
          metadata: { error: error?.message || "unknown" },
          req,
        });
        throw new AuthError("Failed to create user", ErrorCode.SERVICE_UNAVAILABLE);
      }

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_CREATE",
        targetUserId: data.user.id,
        targetEmail: data.user.email || email,
        status: "success",
        metadata: { role, verificationEmailSent: !emailConfirmed },
        req,
      });

      successResponse(
        res,
        emailConfirmed
          ? "User created"
          : "User created. A verification email has been sent to the user.",
        {
          user: mapAdminUser(data.user as UserRecord),
        },
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);
      const id = this.getUserIdParam(req);

      const parsed = updateUserBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid update user payload", parsed.error.issues);
      }

      if (id === actor.actorId && parsed.data.isAdmin === false) {
        throw new ValidationError("You cannot remove your own admin privileges");
      }

      if (id === actor.actorId && parsed.data.role === "user") {
        throw new ValidationError("You cannot remove your own admin role");
      }

      if (id === actor.actorId && parsed.data.banned === true) {
        throw new ValidationError("You cannot ban your own account");
      }

      if (
        parsed.data.role !== undefined &&
        parsed.data.isAdmin !== undefined &&
        (parsed.data.role === "admin") !== parsed.data.isAdmin
      ) {
        throw new ValidationError("Role and isAdmin values must be consistent");
      }

      if (parsed.data.banned === false && parsed.data.banReason) {
        throw new ValidationError("Ban reason can only be set when banned is true");
      }

      if (parsed.data.banned === false && parsed.data.banExpiresAt) {
        throw new ValidationError("Ban expiry can only be set when banned is true");
      }

      const updatePayload: {
        email?: string;
        password?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
      } = {};

      let existingUser: UserRecord | null = null;
      const getExistingUser = async (): Promise<UserRecord> => {
        if (existingUser) {
          return existingUser;
        }

        const adminClient = SupabaseService.getAdminClient();
        const { data: existingData, error: existingError } =
          await adminClient.auth.admin.getUserById(id);

        if (existingError || !existingData.user) {
          throw new AuthError("User not found", ErrorCode.USER_NOT_FOUND);
        }

        existingUser = existingData.user as UserRecord;
        return existingUser;
      };

      if (parsed.data.email) {
        updatePayload.email = parsed.data.email;
      }

      if (parsed.data.password) {
        updatePayload.password = parsed.data.password;
      }

      if (parsed.data.username !== undefined) {
        const currentUser = await getExistingUser();
        const existingUserMetadata = (currentUser.user_metadata || {}) as Record<string, unknown>;
        updatePayload.user_metadata = {
          ...existingUserMetadata,
          username: parsed.data.username,
        };
      }

      if (
        parsed.data.role ||
        parsed.data.isAdmin !== undefined ||
        parsed.data.banned !== undefined ||
        parsed.data.banReason !== undefined ||
        parsed.data.banExpiresAt !== undefined
      ) {
        const currentUser = await getExistingUser();
        const existingAppMetadata = currentUser.app_metadata || {};
        const derivedIsAdmin =
          parsed.data.isAdmin !== undefined
            ? parsed.data.isAdmin
            : parsed.data.role === "admin"
              ? true
              : parsed.data.role === "user"
                ? false
                : undefined;

        const nextBanned =
          parsed.data.banned !== undefined
            ? parsed.data.banned
            : existingAppMetadata.banned === true;

        updatePayload.app_metadata = {
          ...existingAppMetadata,
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(derivedIsAdmin !== undefined ? { is_admin: derivedIsAdmin } : {}),
          ...(parsed.data.banned !== undefined ? { banned: parsed.data.banned } : {}),
          ...(nextBanned
            ? {
                ban_reason:
                  parsed.data.banReason !== undefined
                    ? parsed.data.banReason || null
                    : (existingAppMetadata.ban_reason ?? null),
                ban_expires_at:
                  parsed.data.banExpiresAt !== undefined
                    ? parsed.data.banExpiresAt
                    : (existingAppMetadata.ban_expires_at ?? null),
              }
            : {
                ban_reason: null,
                ban_expires_at: null,
              }),
        };
      }

      if (Object.keys(updatePayload).length === 0) {
        throw new ValidationError("No updatable fields provided");
      }

      const adminClient = SupabaseService.getAdminClient();
      const { data, error } = await adminClient.auth.admin.updateUserById(id, updatePayload);

      if (error || !data.user) {
        adminAuditService.addLog({
          actorUserId: actor.actorId,
          actorEmail: actor.actorEmail,
          action: "USER_UPDATE",
          targetUserId: id,
          status: "failed",
          metadata: { error: error?.message || "unknown" },
          req,
        });
        throw new AuthError("Failed to update user", ErrorCode.SERVICE_UNAVAILABLE);
      }

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_UPDATE",
        targetUserId: id,
        targetEmail: data.user.email || null,
        status: "success",
        metadata: { updatedFields: Object.keys(updatePayload) },
        req,
      });

      successResponse(res, "User updated", {
        user: mapAdminUser(data.user as UserRecord),
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);
      const id = this.getUserIdParam(req);

      if (id === actor.actorId) {
        throw new ValidationError("You cannot delete your own account from admin panel");
      }

      const adminClient = SupabaseService.getAdminClient();
      const { error } = await adminClient.auth.admin.deleteUser(id, false);

      if (error) {
        adminAuditService.addLog({
          actorUserId: actor.actorId,
          actorEmail: actor.actorEmail,
          action: "USER_DELETE",
          targetUserId: id,
          status: "failed",
          metadata: { error: error.message },
          req,
        });
        throw new AuthError("Failed to delete user", ErrorCode.SERVICE_UNAVAILABLE);
      }

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_DELETE",
        targetUserId: id,
        status: "success",
        req,
      });

      successResponse(res, "User deleted");
    } catch (error) {
      next(error);
    }
  }

  async banUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);
      const id = this.getUserIdParam(req);

      if (id === actor.actorId) {
        throw new ValidationError("You cannot ban your own account");
      }

      const parsed = banUserBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid ban payload", parsed.error.issues);
      }

      const updatedUser = await this.updateBanState(id, {
        banned: true,
        reason: parsed.data.reason,
        expiresAt: parsed.data.expiresAt || null,
      });

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_BAN",
        targetUserId: id,
        targetEmail: updatedUser.email || null,
        reason: parsed.data.reason,
        status: "success",
        metadata: {
          expiresAt: parsed.data.expiresAt || null,
        },
        req,
      });

      successResponse(res, "User banned", {
        user: mapAdminUser(updatedUser),
      });
    } catch (error) {
      next(error);
    }
  }

  async unbanUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);
      const id = this.getUserIdParam(req);

      const updatedUser = await this.updateBanState(id, {
        banned: false,
      });

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_UNBAN",
        targetUserId: id,
        targetEmail: updatedUser.email || null,
        status: "success",
        req,
      });

      successResponse(res, "User unbanned", {
        user: mapAdminUser(updatedUser),
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkAction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.ensureActor(req as AuthenticatedRequest);

      const parsed = bulkActionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid bulk action payload", parsed.error.issues);
      }

      const { userIds, action, reason, expiresAt } = parsed.data;

      const adminClient = SupabaseService.getAdminClient();

      const operationResults = await Promise.all(
        userIds.map(async (userId) => {
          try {
            if (action === "delete") {
              if (userId === actor.actorId) {
                return {
                  ok: false as const,
                  userId,
                  message: "You cannot delete your own account",
                };
              }

              const { error } = await adminClient.auth.admin.deleteUser(userId, false);
              if (error) {
                throw new Error(error.message);
              }
            }

            if (action === "ban") {
              if (userId === actor.actorId) {
                return {
                  ok: false as const,
                  userId,
                  message: "You cannot ban your own account",
                };
              }

              await this.updateBanState(userId, {
                banned: true,
                reason: reason || "No reason provided",
                expiresAt: expiresAt || null,
              });
            }

            if (action === "unban") {
              await this.updateBanState(userId, { banned: false });
            }

            return { ok: true as const, userId };
          } catch (bulkError) {
            return {
              ok: false as const,
              userId,
              message: bulkError instanceof Error ? bulkError.message : "Unknown error",
            };
          }
        }),
      );

      const failures = operationResults
        .filter((result) => !result.ok)
        .map((result) => ({
          userId: result.userId,
          message: result.message,
        }));

      const successCount = operationResults.filter((result) => result.ok).length;

      const result: AdminBulkActionResult = {
        action,
        successCount,
        failureCount: failures.length,
        failures,
      };

      adminAuditService.addLog({
        actorUserId: actor.actorId,
        actorEmail: actor.actorEmail,
        action: "USER_BULK_ACTION",
        status: failures.length > 0 ? "failed" : "success",
        reason,
        metadata: {
          action,
          requestedCount: userIds.length,
          successCount,
          failureCount: failures.length,
          expiresAt: expiresAt || null,
        },
        req,
      });

      if (failures.length > 0) {
        successResponse(res, "Bulk action completed with partial failures", result, 207);
        return;
      }

      successResponse(res, "Bulk action completed", result);
    } catch (error) {
      next(error);
    }
  }

  async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = auditQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Invalid audit query", parsed.error.issues);
      }

      const { page, limit, action, actorId, targetUserId } = parsed.data;

      const data = await adminAuditService.listLogs(page, limit, {
        action,
        actorId,
        targetUserId,
      });

      successResponse(res, "Audit logs listed", data);
    } catch (error) {
      next(error);
    }
  }
}
