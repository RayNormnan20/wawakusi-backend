import { Router } from "express";
import { methods as productoController } from "./../controller/producto.controller";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, requirePermission } from "../middleware/auth.middleware";
import config from "./../config";

let storage;
if (config.useCloudinary) {
    storage = multer.memoryStorage();
} else {
    const uploadDir = path.join(__dirname, "../../uploads");
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch {}
    storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `${Date.now()}${ext}`);
        }
    });
}

// Filtro para permitir solo archivos de imagen
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Solo se permiten imágenes"));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB por archivo
});

const router = Router();

router.get("/catalogo", productoController.getCatalogoProductos);
router.get("/promociones", productoController.getPromociones);
router.get("/", productoController.getProductos);
router.post("/", requireAuth, requirePermission("CREAR_PRODUCTO"), upload.single('Imagen'), productoController.addProducto); // Ruta para añadir un producto con imagen
router.put("/:id", requireAuth, requirePermission("EDITAR_PRODUCTO"), upload.single('Imagen'), productoController.updateProducto); // Ruta para actualizar un producto con imagen
router.delete("/:id", requireAuth, requirePermission("ELIMINAR_PRODUCTO"), productoController.deleteProducto);
router.get("/:id", productoController.getProducto);

export default router;
