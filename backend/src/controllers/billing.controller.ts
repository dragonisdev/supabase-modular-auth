import type { Request, Response, NextFunction } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import stripeService from "../services/stripe.service.js";
import { AuthError, ValidationError } from "../utils/errors.js";
import { successResponse } from "../utils/response.js";

export class BillingController {
  public async getOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }

      const result = await stripeService.getOverview(req.user.id);
      successResponse(res, "Billing overview retrieved", result);
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
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }

      const result = await stripeService.createCheckout({
        ...(req.user.email ? { email: req.user.email } : {}),
        id: req.user.id,
      });
      successResponse(res, "Stripe Checkout created", result, 201);
    } catch (error) {
      next(error);
    }
  }

  public async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.get("stripe-signature");
      if (!signature || !Buffer.isBuffer(req.body)) {
        throw new ValidationError("Stripe webhook signature required");
      }

      const result = await stripeService.handleWebhook(req.body, signature);
      successResponse(res, "Stripe webhook received", result);
    } catch (error) {
      next(error);
    }
  }
}
