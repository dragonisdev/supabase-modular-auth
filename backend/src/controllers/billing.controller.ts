import type { Request, Response, NextFunction } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import adminAuditService from "../services/admin-audit.service.js";
import billingService from "../services/billing.service.js";
import { AuthError, ValidationError } from "../utils/errors.js";
import { successResponse } from "../utils/response.js";
import {
  checkoutBodySchema,
  reconcileBodySchema,
  webhookEventIdSchema,
} from "../validators/billing.validator.js";

export class BillingController {
  public async getOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = this.requireUser(req);
      const overview = await billingService.getOverview(user.id);
      successResponse(res, "Billing overview retrieved", overview);
    } catch (error) {
      next(error);
    }
  }

  public async createCheckout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = this.requireUser(req);
      const parsed = checkoutBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid checkout request", parsed.error.issues);
      }

      const url = await billingService.createCheckoutSession(user, parsed.data.priceId);
      successResponse(res, "Billing checkout created", { url }, 201);
    } catch (error) {
      next(error);
    }
  }

  public async createPortal(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const user = this.requireUser(req);
      const url = await billingService.createPortalSession(user.id);
      successResponse(res, "Billing portal created", { url }, 201);
    } catch (error) {
      next(error);
    }
  }

  public async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.get("stripe-signature");
      if (!signature || !Buffer.isBuffer(req.body)) {
        throw new ValidationError("Invalid billing webhook request");
      }

      const result = await billingService.handleWebhook(req.body, signature);
      successResponse(res, "Billing webhook accepted", result);
    } catch (error) {
      next(error);
    }
  }

  public async replayWebhook(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const actor = this.getActor(req);
    const rawEventId = req.params.eventId;
    const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;

    try {
      const parsed = webhookEventIdSchema.safeParse(eventId);
      if (!parsed.success) {
        throw new ValidationError("Invalid Stripe event id", parsed.error.issues);
      }

      const result = await billingService.replayWebhook(parsed.data);
      adminAuditService.addLog({
        action: "billing.webhook.replay",
        actorEmail: actor.actorEmail,
        actorUserId: actor.actorId,
        metadata: { eventId: parsed.data, eventType: result.eventType },
        req,
        status: "success",
      });
      successResponse(res, "Billing webhook replayed", result);
    } catch (error) {
      adminAuditService.addLog({
        action: "billing.webhook.replay",
        actorEmail: actor.actorEmail,
        actorUserId: actor.actorId,
        metadata: { eventId: eventId || null },
        req,
        status: "failed",
      });
      next(error);
    }
  }

  public async reconcileUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const actor = this.getActor(req);

    try {
      const parsed = reconcileBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid billing reconciliation request", parsed.error.issues);
      }

      const result = await billingService.reconcileUser(parsed.data.userId);
      adminAuditService.addLog({
        action: "billing.user.reconcile",
        actorEmail: actor.actorEmail,
        actorUserId: actor.actorId,
        metadata: {
          customerFound: result.customerFound,
          subscriptionsSynchronized: result.subscriptionsSynchronized,
        },
        req,
        status: "success",
        targetUserId: parsed.data.userId,
      });
      successResponse(res, "Billing user reconciled", result);
    } catch (error) {
      adminAuditService.addLog({
        action: "billing.user.reconcile",
        actorEmail: actor.actorEmail,
        actorUserId: actor.actorId,
        req,
        status: "failed",
        targetUserId: typeof req.body?.userId === "string" ? req.body.userId : null,
      });
      next(error);
    }
  }

  private requireUser(req: AuthenticatedRequest): { email?: string; id: string } {
    if (!req.user?.id) {
      throw new AuthError("Authentication required");
    }

    return {
      ...(req.user.email ? { email: req.user.email } : {}),
      id: req.user.id,
    };
  }

  private getActor(req: AuthenticatedRequest): { actorEmail: string | null; actorId: string } {
    const user = this.requireUser(req);
    return { actorEmail: user.email || null, actorId: user.id };
  }
}
