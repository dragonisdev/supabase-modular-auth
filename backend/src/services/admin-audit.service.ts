import type { AdminAuditLog } from "@supabase-modular-auth/types";
import type { Request } from "express";

import { randomUUID } from "crypto";

import SupabaseService from "./supabase.service.js";

interface AdminAuditInput {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  reason?: string | null;
  status: "success" | "failed";
  metadata?: Record<string, unknown>;
  req?: Request;
}

const AUDIT_TABLE = "admin_audit_logs";
const RETENTION_DAYS = 180;
const RETENTION_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 6; // every 6 hours

class AdminAuditService {
  private fallbackLogs: AdminAuditLog[] = [];
  private lastCleanupAt = 0;
  private cleanupInFlight = false;

  private buildLog(input: AdminAuditInput): AdminAuditLog {
    return {
      id: randomUUID(),
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail || null,
      action: input.action,
      target_user_id: input.targetUserId || null,
      target_email: input.targetEmail || null,
      reason: input.reason || null,
      request_id: input.req?.id || null,
      ip: input.req?.ip || null,
      user_agent: input.req?.get("User-Agent") || null,
      status: input.status,
      metadata: input.metadata || {},
      created_at: new Date().toISOString(),
    };
  }

  private addFallbackLog(log: AdminAuditLog): void {
    this.fallbackLogs.unshift(log);

    if (this.fallbackLogs.length > 5000) {
      this.fallbackLogs.length = 5000;
    }
  }

  private maybeTriggerRetentionCleanup(): void {
    const now = Date.now();
    if (this.cleanupInFlight || now - this.lastCleanupAt < RETENTION_CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanupAt = now;
    this.cleanupInFlight = true;

    void (async () => {
      try {
        const adminClient = SupabaseService.getAdminClient();
        const { error } = await adminClient.rpc("admin_purge_audit_logs", {
          p_retention_days: RETENTION_DAYS,
        });

        if (error) {
          console.warn(`⚠️ Admin audit retention cleanup failed: ${error.message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(`⚠️ Admin audit retention cleanup error: ${message}`);
      } finally {
        this.cleanupInFlight = false;
      }
    })();
  }

  addLog(input: AdminAuditInput): void {
    const log = this.buildLog(input);
    this.maybeTriggerRetentionCleanup();

    void (async () => {
      try {
        const adminClient = SupabaseService.getAdminClient();
        const { error } = await adminClient.from(AUDIT_TABLE).insert({
          id: log.id,
          actor_user_id: log.actor_user_id,
          actor_email: log.actor_email,
          action: log.action,
          target_user_id: log.target_user_id,
          target_email: log.target_email,
          reason: log.reason,
          request_id: log.request_id,
          ip: log.ip,
          user_agent: log.user_agent,
          status: log.status,
          metadata: log.metadata,
          created_at: log.created_at,
        });

        if (error) {
          this.addFallbackLog(log);
          console.warn(`⚠️ Failed to persist admin audit log: ${error.message}`);
        }
      } catch (error) {
        this.addFallbackLog(log);
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(`⚠️ Failed to persist admin audit log: ${message}`);
      }
    })();
  }

  async listLogs(
    page: number,
    limit: number,
    filters?: { action?: string; actorId?: string; targetUserId?: string },
  ) {
    this.maybeTriggerRetentionCleanup();

    try {
      const adminClient = SupabaseService.getAdminClient();
      let query = adminClient
        .from(AUDIT_TABLE)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters?.action) {
        query = query.eq("action", filters.action);
      }

      if (filters?.actorId) {
        query = query.eq("actor_user_id", filters.actorId);
      }

      if (filters?.targetUserId) {
        query = query.eq("target_user_id", filters.targetUserId);
      }

      const start = (page - 1) * limit;
      const end = start + limit - 1;
      const { data, error, count } = await query.range(start, end);

      if (error) {
        throw error;
      }

      const items = ((data || []) as AdminAuditLog[]).map((item) => {
        const normalizedMetadata =
          item.metadata && typeof item.metadata === "object" ? item.metadata : {};

        return {
          id: item.id,
          actor_user_id: item.actor_user_id,
          actor_email: item.actor_email,
          action: item.action,
          target_user_id: item.target_user_id,
          target_email: item.target_email,
          reason: item.reason,
          request_id: item.request_id,
          ip: item.ip,
          user_agent: item.user_agent,
          status: item.status,
          metadata: normalizedMetadata,
          created_at: item.created_at,
        };
      });

      const total = count || 0;
      return {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`⚠️ Failed to list persisted admin audit logs, using fallback: ${message}`);

      let result = [...this.fallbackLogs];

      if (filters?.action) {
        result = result.filter((log) => log.action === filters.action);
      }

      if (filters?.actorId) {
        result = result.filter((log) => log.actor_user_id === filters.actorId);
      }

      if (filters?.targetUserId) {
        result = result.filter((log) => log.target_user_id === filters.targetUserId);
      }

      const total = result.length;
      const start = (page - 1) * limit;
      const items = result.slice(start, start + limit);

      return {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }
  }
}

const adminAuditService = new AdminAuditService();
export default adminAuditService;
