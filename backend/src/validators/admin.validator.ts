import {
  adminAuditQuerySchema,
  adminBanUserSchema,
  adminBulkActionSchema,
  adminCreateUserSchema,
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
} from "@supabase-modular-auth/types";
import xss from "xss";

const sanitize = (value: string): string => xss(value.trim());

export const listUsersQuerySchema = adminListUsersQuerySchema.transform((input) => ({
  ...input,
  search: input.search ? sanitize(input.search) : undefined,
  filterRole: input.filterRole ? sanitize(input.filterRole) : undefined,
}));

export const createUserBodySchema = adminCreateUserSchema.transform((input) => ({
  ...input,
  username: input.username ? sanitize(input.username) : undefined,
  role: sanitize(input.role),
}));

export const updateUserBodySchema = adminUpdateUserSchema.transform((input) => ({
  ...input,
  username: typeof input.username === "string" ? sanitize(input.username) : input.username,
  role: input.role ? sanitize(input.role) : undefined,
}));

export const banUserBodySchema = adminBanUserSchema.transform((input) => ({
  ...input,
  reason: sanitize(input.reason),
}));

export const bulkActionBodySchema = adminBulkActionSchema.transform((input) => ({
  ...input,
  reason: input.reason ? sanitize(input.reason) : undefined,
}));

export const auditQuerySchema = adminAuditQuerySchema.transform((input) => ({
  ...input,
  action: input.action ? sanitize(input.action) : undefined,
  actorId: input.actorId ? sanitize(input.actorId) : undefined,
  targetUserId: input.targetUserId ? sanitize(input.targetUserId) : undefined,
}));
