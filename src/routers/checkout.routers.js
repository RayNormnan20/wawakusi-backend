import { Router } from "express";
import { methods as checkoutController } from "./../controller/checkout.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/paypal/create", requireAuth, checkoutController.crearCheckoutPaypal);
router.post("/paypal/capture", requireAuth, checkoutController.capturarPaypal);

export default router;

