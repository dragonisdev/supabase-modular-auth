import { Router, raw } from "express";

import config from "../config/env.js";
import { BillingController } from "../controllers/billing.controller.js";
import { authenticate, requireVerified } from "../middleware/auth.middleware.js";

export const createBillingWebhookRoutes = (): Router => {
  const router = Router();
  const billingController = new BillingController();

  router.post(
    "/webhook",
    raw({ limit: config.STRIPE_WEBHOOK_MAX_SIZE, type: "application/json" }),
    (req, res, next) => billingController.handleWebhook(req, res, next),
  );

  return router;
};

export const createBillingRoutes = (): Router => {
  const router = Router();
  const billingController = new BillingController();

  router.use(authenticate, requireVerified);
  router.get("/", (req, res, next) => billingController.getOverview(req, res, next));
  router.post("/checkout", (req, res, next) => billingController.createCheckout(req, res, next));
  router.post("/portal", (req, res, next) => billingController.createPortal(req, res, next));

  return router;
};
