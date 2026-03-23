// cliente.routes.js
import { Router } from "express";
import { methods as clienteController } from "./../controller/cliente.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN"), clienteController.getClientes);
router.get("/:id", requireAuth, requireRole("ADMIN"), clienteController.getCliente);
router.post("/", requireAuth, requireRole("ADMIN"), clienteController.addCliente);
router.put("/:id", requireAuth, requireRole("ADMIN"), clienteController.updateCliente);
router.delete("/:id", requireAuth, requireRole("ADMIN"), clienteController.deleteCliente);

export default router;
