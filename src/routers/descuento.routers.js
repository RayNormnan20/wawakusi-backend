import { Router } from "express";
import { methods as descuentoController } from "./../controller/descuento.controller";
import { requireAuth, requirePermission } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, requirePermission("EDITAR_PRODUCTO"), descuentoController.listarDescuentos);
router.post("/", requireAuth, requirePermission("EDITAR_PRODUCTO"), descuentoController.crearDescuento);
router.put("/:id", requireAuth, requirePermission("EDITAR_PRODUCTO"), descuentoController.actualizarDescuento);
router.delete("/:id", requireAuth, requirePermission("EDITAR_PRODUCTO"), descuentoController.eliminarDescuento);

export default router;

