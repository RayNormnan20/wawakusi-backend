import { Router } from "express";
import { methods as rolController } from "./../controller/rol.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN"), rolController.getRoles);

export default router;

