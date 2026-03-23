import { Router } from "express";
import { methods as loginController} from "./../controller/login.controller";
import { optionalAuth } from "../middleware/auth.middleware";
const router=Router();

router.post("/", loginController.login);
router.post("/register", loginController.registerCliente);
router.get("/views", optionalAuth, loginController.getVistas);

export default router;
