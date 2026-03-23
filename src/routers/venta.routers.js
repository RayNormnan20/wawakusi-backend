import { Router } from "express";
import { methods as ventaController } from "./../controller/venta.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN"), ventaController.listarVentasAdmin);
router.get("/mias", requireAuth, ventaController.listarMisVentas);
router.get("/consultar", requireAuth, ventaController.consultarPedidoPorCodigo);
router.put("/:id/estado", requireAuth, requireRole("ADMIN"), ventaController.actualizarEstado);

export default router;
