import type { Response, NextFunction } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import stripeService from "../services/stripe.service.js";
import { AuthError } from "../utils/errors.js";
import { successResponse } from "../utils/response.js";

export class BillingController {
  public async createCheckout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AuthError("Authentication required");
      }

      const result = await stripeService.createCheckout({ id: req.user.id });
      successResponse(res, "Stripe Checkout created", result, 201);
    } catch (error) {
      next(error);
    }
  }
}
