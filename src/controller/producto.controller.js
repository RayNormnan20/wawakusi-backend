import { getConnection } from "./../database/conexcion";
import path from "path";
import fs from "fs";
import config from "./../config";
import cloudinarySvc from "./../services/cloudinary";

// Función para obtener todos los productos
const getProductos = async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.query(
            `SELECT
                ID AS id,
                NOMBRE AS nombre,
                CAST(PRECIO_MIN AS CHAR) AS precio,
                CAST(STOCK AS CHAR) AS cantidad,
                DESCRIPCION AS descripcion,
                IMAGEN AS imagen
             FROM PRODUCTO
             WHERE ESTADO = 1
             ORDER BY ID DESC`
        );
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const calcularPrecioFinal = (precioBase, descuentoPorcentaje) => {
    const base = Number(precioBase);
    const porc = Number(descuentoPorcentaje);
    if (!isFinite(base) || !isFinite(porc)) return null;
    const final = base - (base * porc) / 100;
    return Number(final.toFixed(2));
};

const normalizarNumero = (v) => {
    const n = Number(v);
    return isFinite(n) ? Number(n.toFixed(2)) : null;
};

const getCatalogoProductos = async (req, res) => {
    try {
        const connection = await getConnection();
        const [productosRows] = await connection.query(
            `SELECT
                p.ID AS id,
                p.NOMBRE AS nombre,
                p.DESCRIPCION AS descripcion,
                p.IMAGEN AS imagen,
                p.PRECIO_MIN AS precioMin,
                p.PRECIO_MAX AS precioMax,
                p.STOCK AS stock,
                d.IDDESCUENTO AS descuentoId,
                d.NOMBRE AS descuentoNombre,
                d.PORCENTAJE AS descuentoPorcentaje
             FROM PRODUCTO p
             LEFT JOIN PRODUCTO_DESCUENTO pd ON pd.PRODUCTO_ID = p.ID
             LEFT JOIN DESCUENTO d ON d.IDDESCUENTO = pd.DESCUENTO_ID
                AND d.ESTADO = 1
                AND NOW() BETWEEN d.FECHA_INICIO AND d.FECHA_FIN
             WHERE p.ESTADO = 1
             ORDER BY p.ID DESC`
        );

        const productoIds = productosRows.map((r) => r.id).filter((v) => v != null);
        let variantesRows = [];
        if (productoIds.length > 0) {
            const placeholders = productoIds.map(() => "?").join(",");
            const [rowsVar] = await connection.query(
                `SELECT
                    IDVARIANTE AS idVariante,
                    PRODUCTO_ID AS productoId,
                    TALLA AS talla,
                    COLOR AS color,
                    PRECIO AS precio,
                    STOCK AS stock
                 FROM PRODUCTO_VARIANTE
                 WHERE PRODUCTO_ID IN (${placeholders})`,
                productoIds
            );
            variantesRows = rowsVar;
        }

        const variantesPorProducto = new Map();
        for (const v of variantesRows) {
            const arr = variantesPorProducto.get(v.productoId) || [];
            arr.push({
                idVariante: v.idVariante,
                talla: v.talla,
                color: v.color,
                precio: normalizarNumero(v.precio),
                stock: v.stock == null ? null : Number(v.stock)
            });
            variantesPorProducto.set(v.productoId, arr);
        }

        const productos = productosRows.map((p) => {
            const variantes = variantesPorProducto.get(p.id) || [];
            const precioBase = normalizarNumero(p.precioMin);
            const descuentoPorcentaje = p.descuentoPorcentaje == null ? null : Number(p.descuentoPorcentaje);
            const precioFinal = descuentoPorcentaje != null ? calcularPrecioFinal(precioBase, descuentoPorcentaje) : precioBase;

            return {
                id: p.id,
                nombre: p.nombre,
                descripcion: p.descripcion,
                imagen: p.imagen,
                stock: p.stock == null ? null : Number(p.stock),
                precioBase,
                precioFinal,
                descuento: p.descuentoId
                    ? {
                          id: p.descuentoId,
                          nombre: p.descuentoNombre,
                          porcentaje: descuentoPorcentaje
                      }
                    : null,
                variantes
            };
        });

        res.json(productos);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const getPromociones = async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.query(
            `SELECT
                p.ID AS id,
                p.NOMBRE AS nombre,
                p.DESCRIPCION AS descripcion,
                p.IMAGEN AS imagen,
                p.PRECIO_MIN AS precioMin,
                d.IDDESCUENTO AS descuentoId,
                d.NOMBRE AS descuentoNombre,
                d.PORCENTAJE AS descuentoPorcentaje
             FROM PRODUCTO p
             INNER JOIN PRODUCTO_DESCUENTO pd ON pd.PRODUCTO_ID = p.ID
             INNER JOIN DESCUENTO d ON d.IDDESCUENTO = pd.DESCUENTO_ID
                AND d.ESTADO = 1
                AND NOW() BETWEEN d.FECHA_INICIO AND d.FECHA_FIN
             WHERE p.ESTADO = 1
             ORDER BY d.FECHA_FIN ASC, p.ID DESC`
        );

        const productoIds = rows.map((r) => r.id).filter((v) => v != null);
        let variantesRows = [];
        if (productoIds.length > 0) {
            const placeholders = productoIds.map(() => "?").join(",");
            const [rowsVar] = await connection.query(
                `SELECT
                    IDVARIANTE AS idVariante,
                    PRODUCTO_ID AS productoId,
                    TALLA AS talla,
                    COLOR AS color,
                    PRECIO AS precio,
                    STOCK AS stock
                 FROM PRODUCTO_VARIANTE
                 WHERE PRODUCTO_ID IN (${placeholders})`,
                productoIds
            );
            variantesRows = rowsVar;
        }
        const variantesPorProducto = new Map();
        for (const v of variantesRows) {
            const arr = variantesPorProducto.get(v.productoId) || [];
            arr.push({
                idVariante: v.idVariante,
                talla: v.talla,
                color: v.color,
                precio: normalizarNumero(v.precio),
                stock: v.stock == null ? null : Number(v.stock)
            });
            variantesPorProducto.set(v.productoId, arr);
        }

        const promos = rows.map((p) => {
            const precioBase = normalizarNumero(p.precioMin);
            const descuentoPorcentaje = p.descuentoPorcentaje == null ? null : Number(p.descuentoPorcentaje);
            const precioFinal = calcularPrecioFinal(precioBase, descuentoPorcentaje);
            return {
                id: p.id,
                nombre: p.nombre,
                descripcion: p.descripcion,
                imagen: p.imagen,
                stock: null,
                precioBase,
                precioFinal,
                descuento: {
                    id: p.descuentoId,
                    nombre: p.descuentoNombre,
                    porcentaje: descuentoPorcentaje
                },
                variantes: variantesPorProducto.get(p.id) || []
            };
        });

        res.json(promos);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// Función para obtener un producto por su ID
const getProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await getConnection();
        const [rows] = await connection.query(
            `SELECT
                ID AS id,
                NOMBRE AS nombre,
                CAST(PRECIO_MIN AS CHAR) AS precio,
                CAST(STOCK AS CHAR) AS cantidad,
                DESCRIPCION AS descripcion,
                IMAGEN AS imagen
             FROM PRODUCTO
             WHERE ID = ?
             LIMIT 1`,
            [id]
        );
        res.json(rows[0]);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// Función para agregar un producto con imagen
const addProducto = async (req, res) => {
    try {
        const { Nombre, Precio, Cantidad, Descripcion, Talla, Color } = req.body;
        let Imagen = null;
        if (req.file) {
            if (cloudinarySvc.isEnabled()) {
                try {
                    if (req.file.buffer) {
                        const up = await cloudinarySvc.uploadBuffer({ buffer: req.file.buffer });
                        if (up?.url) Imagen = up.url;
                    } else if (req.file.path) {
                        const up = await cloudinarySvc.uploadLocalImage({ filePath: req.file.path });
                        if (up?.url) Imagen = up.url;
                        if (fs.existsSync(req.file.path)) {
                            fs.unlink(req.file.path, () => {});
                        }
                    }
                } catch (e) {
                    const baseUrl = `${req.protocol}://${req.get("host")}`;
                    Imagen = req.file.filename ? `${baseUrl}/uploads/${req.file.filename}` : null;
                }
            } else {
                const baseUrl = `${req.protocol}://${req.get("host")}`;
                Imagen = req.file.filename ? `${baseUrl}/uploads/${req.file.filename}` : null;
            }
        }

        if (!Nombre || !Precio || !Cantidad || !Imagen) {
            return res.status(400).json({ message: "Por favor completa todos los campos requeridos." });
        }

        const connection = await getConnection();

        const [catRows] = await connection.query(
            "SELECT CODCATEGORIA FROM CATEGORIA ORDER BY CODCATEGORIA ASC LIMIT 1"
        );
        let categoriaId = catRows[0]?.CODCATEGORIA;
        if (!categoriaId) {
            const now = new Date();
            const [insCat] = await connection.query(
                "INSERT INTO CATEGORIA (NOMBRE, ESTADO, CREATEDAT, UPDATEDAT) VALUES (?, ?, ?, ?)",
                ["General", 1, now, now]
            );
            categoriaId = insCat.insertId;
        }

        const precio = Number(String(Precio ?? "0").replace(",", "."));
        const stock = Number(String(Cantidad ?? "0").replace(",", "."));
        const now = new Date();

        const [insertProducto] = await connection.query(
            `INSERT INTO PRODUCTO (CATEGORIA_ID, NOMBRE, MARCA, DESCRIPCION, COSTO, PRECIO_MIN, PRECIO_MAX, STOCK, ESTADO, IMAGEN, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                categoriaId,
                Nombre,
                null,
                Descripcion || null,
                0,
                isNaN(precio) ? 0 : precio,
                isNaN(precio) ? 0 : precio,
                isNaN(stock) ? 0 : stock,
                1,
                Imagen,
                now,
                now
            ]
        );

        await connection.query(
            `INSERT INTO PRODUCTO_VARIANTE (PRODUCTO_ID, TALLA, COLOR, PRECIO, STOCK)
             VALUES (?, ?, ?, ?, ?)`,
            [insertProducto.insertId, Talla || null, Color || null, isNaN(precio) ? null : precio, isNaN(stock) ? null : stock]
        );

        res.json({ message: "Producto agregado con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// Función para actualizar un producto con imagen
const updateProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const { Nombre, Precio, Cantidad, Descripcion, Talla, Color } = req.body;
        const connection = await getConnection();

        const [rows] = await connection.query("SELECT IMAGEN AS imagen FROM PRODUCTO WHERE ID = ? LIMIT 1", [id]);
        const currentImage = rows[0]?.imagen;

        let Imagen = null;
        if (req.file) {
            if (cloudinarySvc.isEnabled()) {
                try {
                    if (req.file.buffer) {
                        const up = await cloudinarySvc.uploadBuffer({ buffer: req.file.buffer });
                        if (up?.url) Imagen = up.url;
                    } else if (req.file.path) {
                        const up = await cloudinarySvc.uploadLocalImage({ filePath: req.file.path });
                        if (up?.url) Imagen = up.url;
                        if (fs.existsSync(req.file.path)) {
                            fs.unlink(req.file.path, () => {});
                        }
                    }
                } catch {
                    const baseUrl = `${req.protocol}://${req.get("host")}`;
                    Imagen = req.file.filename ? `${baseUrl}/uploads/${req.file.filename}` : null;
                }
            } else {
                const baseUrl = `${req.protocol}://${req.get("host")}`;
                Imagen = req.file.filename ? `${baseUrl}/uploads/${req.file.filename}` : null;
            }
        }

        if (!Nombre || !Precio || !Cantidad) {
            return res.status(400).json({ message: "Por favor completa todos los campos requeridos." });
        }

        if (Imagen && currentImage) {
            if (cloudinarySvc.isEnabled() && /res\.cloudinary\.com|cloudinary\.com/.test(currentImage)) {
                await cloudinarySvc.deleteByUrl(currentImage);
            } else {
                const imageName = path.basename(currentImage);
                const imagePath = path.join(__dirname, "../../uploads", imageName);
                if (fs.existsSync(imagePath)) {
                    fs.unlink(imagePath, (err) => {
                        if (err) console.error("Error al eliminar la imagen anterior:", err);
                    });
                }
            }
        }

        const precio = Number(String(Precio ?? "0").replace(",", "."));
        const stock = Number(String(Cantidad ?? "0").replace(",", "."));
        const now = new Date();

        if (Imagen) {
            await connection.query(
                `UPDATE PRODUCTO
                 SET NOMBRE = ?, DESCRIPCION = ?, PRECIO_MIN = ?, PRECIO_MAX = ?, STOCK = ?, IMAGEN = ?, UPDATEDAT = ?
                 WHERE ID = ?`,
                [
                    Nombre,
                    Descripcion || null,
                    isNaN(precio) ? 0 : precio,
                    isNaN(precio) ? 0 : precio,
                    isNaN(stock) ? 0 : stock,
                    Imagen,
                    now,
                    id
                ]
            );
        } else {
            await connection.query(
                `UPDATE PRODUCTO
                 SET NOMBRE = ?, DESCRIPCION = ?, PRECIO_MIN = ?, PRECIO_MAX = ?, STOCK = ?, UPDATEDAT = ?
                 WHERE ID = ?`,
                [
                    Nombre,
                    Descripcion || null,
                    isNaN(precio) ? 0 : precio,
                    isNaN(precio) ? 0 : precio,
                    isNaN(stock) ? 0 : stock,
                    now,
                    id
                ]
            );
        }

        const [varRows] = await connection.query(
            "SELECT IDVARIANTE AS idVariante FROM PRODUCTO_VARIANTE WHERE PRODUCTO_ID = ? ORDER BY IDVARIANTE ASC LIMIT 1",
            [id]
        );
        const idVariante = varRows[0]?.idVariante;
        if (idVariante) {
            await connection.query(
                "UPDATE PRODUCTO_VARIANTE SET TALLA = ?, COLOR = ?, PRECIO = ?, STOCK = ? WHERE IDVARIANTE = ?",
                [Talla || null, Color || null, isNaN(precio) ? null : precio, isNaN(stock) ? null : stock, idVariante]
            );
        } else {
            await connection.query(
                `INSERT INTO PRODUCTO_VARIANTE (PRODUCTO_ID, TALLA, COLOR, PRECIO, STOCK)
                 VALUES (?, ?, ?, ?, ?)`,
                [id, Talla || null, Color || null, isNaN(precio) ? null : precio, isNaN(stock) ? null : stock]
            );
        }

        res.json({ message: "Producto actualizado con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// Función para eliminar una imagen de la carpeta uploads
const eliminarImagen = async (id) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.query("SELECT IMAGEN AS imagen FROM PRODUCTO WHERE ID = ? LIMIT 1", [id]);
        const currentImage = rows[0]?.imagen;

        if (currentImage) {
            if (cloudinarySvc.isEnabled() && /res\.cloudinary\.com|cloudinary\.com/.test(currentImage)) {
                await cloudinarySvc.deleteByUrl(currentImage);
            } else {
                const imageName = path.basename(currentImage);
                const imagePath = path.join(__dirname, "../../uploads", imageName);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`Imagen ${imageName} eliminada correctamente.`);
                } else {
                    console.log(`La imagen ${imageName} no existe en la carpeta uploads.`);
                }
            }
        } else {
            console.log("No se encontró la imagen asociada con el ID proporcionado.");
        }
    } catch (error) {
        console.error("Error al intentar eliminar la imagen:", error.message);
    }
};

// Función para eliminar un producto
const deleteProducto = async (req, res) => {
    try {
        const { id } = req.params;

        await eliminarImagen(id);

        const connection = await getConnection();
        await connection.query("DELETE FROM PRODUCTO_DESCUENTO WHERE PRODUCTO_ID = ?", [id]);
        await connection.query("DELETE FROM PRODUCTO_VARIANTE WHERE PRODUCTO_ID = ?", [id]);
        await connection.query("DELETE FROM PRODUCTO WHERE ID = ?", [id]);
        res.json({ message: "Producto eliminado con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};


// Exportar todas las funciones
export const methods = {
    getProductos,
    getProducto,
    addProducto,
    updateProducto,
    deleteProducto,
    getCatalogoProductos,
    getPromociones
};
