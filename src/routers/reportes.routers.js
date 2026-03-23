import { Router } from "express";
import { methods as reportesController } from "./../controller/reportes.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get("/ventas", requireAuth, requireRole("ADMIN"), reportesController.getReporteVentas);
router.get("/dashboard", requireAuth, requireRole("ADMIN"), reportesController.getDashboard);

export default router;
