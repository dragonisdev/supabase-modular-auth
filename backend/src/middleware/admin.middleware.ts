import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth.middleware.js";

import SupabaseService from "../services/supabase.service.js";
import { UnauthorizedError } from "../utils/errors.js";
import * as SecurityLogger from "../utils/logger.js";

const ADMIN_ROLE = "admin";

const hasAdminPrivileges = (appMetadata: unknown): boolean => {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }

  const metadata = appMetadata as { role?: unknown; is_admin?: unknown };

  if (typeof metadata.is_admin === "boolean" && metadata.is_admin) {
    return true;
  }

  if (typeof metadata.role === "string") {
    return metadata.role.toLowerCase() === ADMIN_ROLE;
  }

  return false;
};

export const requireAdmin = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      throw new UnauthorizedError("Authentication required");
    }

    const adminClient = SupabaseService.getAdminClient();
    const { data, error } = await adminClient.auth.admin.getUserById(req.user.id);

    if (error || !data.user) {
      SecurityLogger.logSecurityEvent("ADMIN_USER_LOOKUP_FAILED", req, {
        userId: req.user.id,
        errorType: error?.name,
      });
      throw new UnauthorizedError("Unable to verify admin privileges");
    }

    if (!hasAdminPrivileges(data.user.app_metadata)) {
      SecurityLogger.logSecurityEvent("ADMIN_ACCESS_DENIED", req, {
        userId: req.user.id,
      });
      throw new UnauthorizedError("Admin access required");
    }

    req.user = {
      ...req.user,
      role:
        typeof data.user.app_metadata?.role === "string" ? data.user.app_metadata.role : ADMIN_ROLE,
      is_admin: true,
    };

    next();
  } catch (error) {
    next(error);
  }
};
