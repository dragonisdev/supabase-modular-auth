import type { Request, Response, NextFunction } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import stripeService from "../services/stripe.service.js";
import { AuthError, ValidationError } from "../utils/errors.js";
import * as SecurityLogger from "../utils/logger.js";
import { successResponse } from "../utils/response.js";

export class BillingController {
  public async createCheckoutTest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }

      const result = await stripeService.createCheckoutTest({ id: req.user.id });
      successResponse(res, "Stripe Checkout smoke test created", result, 201);
    } catch (error) {
      next(error);
    }
  }

  public handleWebhook(req: Request, res: Response, next: NextFunction): void {
    try {
      const signature = req.get("stripe-signature");
      if (!signature || !Buffer.isBuffer(req.body)) {
        throw new ValidationError("Invalid Stripe webhook request");
      }

      const result = stripeService.verifyWebhook(req.body, signature);
      SecurityLogger.logSecurityEvent("STRIPE_WEBHOOK_VERIFIED", req, {
        checkoutCompleted: result.checkoutCompleted,
        eventId: result.eventId,
        eventType: result.eventType,
        paymentStatus: result.paymentStatus,
      });
      successResponse(res, "Stripe webhook verified", result);
    } catch (error) {
      next(error);
    }
  }
}
