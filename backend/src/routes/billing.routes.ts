import { Router } from "express";

import { BillingController } from "../controllers/billing.controller.js";
import { authenticate, requireVerified } from "../middleware/auth.middleware.js";

export const createBillingRoutes = (): Router => {
  const router = Router();
  const billingController = new BillingController();

  router.post("/checkout", authenticate, requireVerified, (req, res, next) =>
    billingController.createCheckout(req, res, next),
  );

  return router;
};
