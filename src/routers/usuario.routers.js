// usuario.routes.js
import { Router } from "express";
import { methods as usuarioController} from "./../controller/usuario.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
const router=Router();

router.get("/me", requireAuth, usuarioController.getMe);
router.put("/me", requireAuth, usuarioController.updateMe);

router.get("/", requireAuth, requireRole("ADMIN"), usuarioController.getUsuarios);
router.get("/:id", requireAuth, requireRole("ADMIN"), usuarioController.getUsuario);
router.post("/", requireAuth, requireRole("ADMIN"), usuarioController.addUsuario);
router.put("/:id", requireAuth, requireRole("ADMIN"), usuarioController.updateUsuario);
router.delete("/:id", requireAuth, requireRole("ADMIN"), usuarioController.deleteUsuario);

export default router;
