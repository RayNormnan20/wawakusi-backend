import { Router } from "express";
import { methods as carritoController } from "./../controller/carrito.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, carritoController.getMiCarrito);
router.post("/items", requireAuth, carritoController.addMiCarritoItem);
router.put("/items/:idDetalle", requireAuth, carritoController.updateMiCarritoItem);
router.delete("/items/:idDetalle", requireAuth, carritoController.deleteMiCarritoItem);

export default router;
