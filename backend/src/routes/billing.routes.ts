import { Router } from "express";

import { BillingController } from "../controllers/billing.controller.js";
import { authenticate, requireVerified } from "../middleware/auth.middleware.js";

export const createBillingRoutes = (): Router => {
  const router = Router();
  const billingController = new BillingController();

  router.post("/webhook", (req, res, next) => billingController.handleWebhook(req, res, next));
  router.post("/test-checkout", authenticate, requireVerified, (req, res, next) =>
    billingController.createCheckoutTest(req, res, next),
  );

  return router;
};
