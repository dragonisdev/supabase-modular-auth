import { z } from "zod";

export const adminRoleSchema = z.enum(["admin", "user"]);

export const adminListUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(["created_at", "email", "last_sign_in_at"]).optional().default("created_at"),
  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
  filterRole: adminRoleSchema.optional(),
  filterBanned: z
    .preprocess((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
          return true;
        }

        if (normalized === "false") {
          return false;
        }
      }

      return value;
    }, z.boolean())
    .optional(),
});

export const adminCreateUserSchema = z.object({
  email: z
    .email("Please enter a valid email address (example: user@domain.com).")
    .trim()
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(128, "Password cannot exceed 128 characters."),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters long.")
    .max(30, "Username cannot exceed 30 characters.")
    .optional(),
  role: adminRoleSchema.optional().default("user"),
  emailConfirmed: z.boolean().optional().default(false),
});

export const adminUpdateUserSchema = z.object({
  email: z
    .email("Please enter a valid email address (example: user@domain.com).")
    .trim()
    .transform((val) => val.toLowerCase().trim())
    .optional(),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters long.")
    .max(30, "Username cannot exceed 30 characters.")
    .nullable()
    .optional(),
  role: adminRoleSchema.optional(),
  isAdmin: z.boolean().optional(),
  banned: z.boolean().optional(),
  banReason: z
    .string()
    .trim()
    .max(300, "Ban reason cannot exceed 300 characters.")
    .nullable()
    .optional(),
  banExpiresAt: z.iso.datetime().nullable().optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(128, "Password cannot exceed 128 characters.")
    .optional(),
});

export const adminBanUserSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional().default("No reason provided"),
  expiresAt: z.iso.datetime().optional(),
});

export const adminBulkActionSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["ban", "unban", "delete"]),
  reason: z.string().trim().min(1).max(300).optional(),
  expiresAt: z.iso.datetime().optional(),
});

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(128).optional(),
  targetUserId: z.string().trim().max(128).optional(),
});

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  role: string;
  is_admin: boolean;
  banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  email_verified: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface PaginatedData<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  reason: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  status: "success" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminBulkActionFailure {
  userId: string;
  message: string;
}

export interface AdminBulkActionResult {
  action: "ban" | "unban" | "delete";
  successCount: number;
  failureCount: number;
  failures: AdminBulkActionFailure[];
}

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminBanUserInput = z.infer<typeof adminBanUserSchema>;
export type AdminBulkActionInput = z.infer<typeof adminBulkActionSchema>;
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
