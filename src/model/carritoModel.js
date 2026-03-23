import { getConnection } from "./../database/conexcion";

const withTransaction = async (fn) => {
    const pool = await getConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        try {
            await connection.rollback();
        } catch (_) {}
        throw e;
    } finally {
        try {
            connection.release();
        } catch (_) {}
    }
};

const obtenerClienteIdPorUsuarioId = async (idUsuario) => {
    const pool = await getConnection();
    const [rows] = await pool.query("SELECT ID FROM CLIENTE WHERE IDUSUARIO = ? AND ESTADO = 1 LIMIT 1", [idUsuario]);
    return rows.length ? rows[0].ID : null;
};

const obtenerCarritoActualId = async (clienteId) => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        "SELECT IDCARRITO FROM CARRITO WHERE CLIENTE_ID = ? ORDER BY UPDATEDAT DESC, IDCARRITO DESC LIMIT 1",
        [clienteId]
    );
    return rows.length ? rows[0].IDCARRITO : null;
};

const crearCarrito = async (connection, clienteId) => {
    const now = new Date();
    const [result] = await connection.query(
        "INSERT INTO CARRITO (CLIENTE_ID, CREATEDAT, UPDATEDAT) VALUES (?, ?, ?)",
        [clienteId, now, now]
    );
    return result.insertId;
};

const tocarCarrito = async (connection, carritoId) => {
    await connection.query("UPDATE CARRITO SET UPDATEDAT = ? WHERE IDCARRITO = ?", [new Date(), carritoId]);
};

const obtenerOCrearCarrito = async (clienteId) => {
    const existente = await obtenerCarritoActualId(clienteId);
    if (existente) return existente;
    const pool = await getConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const id = await crearCarrito(connection, clienteId);
        await connection.commit();
        return id;
    } catch (e) {
        try {
            await connection.rollback();
        } catch (_) {}
        throw e;
    } finally {
        try {
            connection.release();
        } catch (_) {}
    }
};

const obtenerCarrito = async (clienteId) => {
    const carritoId = await obtenerCarritoActualId(clienteId);
    if (!carritoId) return { carritoId: null, items: [] };

    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            cd.IDCARRITO_DETALLE AS idDetalle,
            cd.CARRITO_ID AS carritoId,
            cd.PRODUCTO_VARIANTE_ID AS productoVarianteId,
            cd.CANTIDAD AS cantidad,
            pv.PRODUCTO_ID AS productoId,
            pv.TALLA AS talla,
            pv.COLOR AS color,
            COALESCE(pv.PRECIO, p.PRECIO_MIN) AS precioBase,
            dd.descuentoPorcentaje AS descuentoPorcentaje,
            ROUND(COALESCE(pv.PRECIO, p.PRECIO_MIN) * (1 - (IFNULL(dd.descuentoPorcentaje, 0) / 100)), 2) AS precioUnitario,
            p.NOMBRE AS productoNombre,
            p.IMAGEN AS imagen
         FROM CARRITO_DETALLE cd
         INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = cd.PRODUCTO_VARIANTE_ID
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         LEFT JOIN (
            SELECT
                pd.PRODUCTO_ID AS productoId,
                MAX(d.PORCENTAJE) AS descuentoPorcentaje
            FROM PRODUCTO_DESCUENTO pd
            INNER JOIN DESCUENTO d ON d.IDDESCUENTO = pd.DESCUENTO_ID
                AND d.ESTADO = 1
                AND NOW() BETWEEN d.FECHA_INICIO AND d.FECHA_FIN
            GROUP BY pd.PRODUCTO_ID
         ) dd ON dd.productoId = p.ID
         WHERE cd.CARRITO_ID = ?
         ORDER BY cd.IDCARRITO_DETALLE DESC`,
        [carritoId]
    );

    return {
        carritoId,
        items: rows.map((r) => ({
            idDetalle: r.idDetalle,
            carritoId: r.carritoId,
            productoId: r.productoId,
            productoNombre: r.productoNombre,
            imagen: r.imagen,
            productoVarianteId: r.productoVarianteId,
            talla: r.talla,
            color: r.color,
            precioUnitario: r.precioUnitario == null ? null : Number(r.precioUnitario),
            precioBase: r.precioBase == null ? null : Number(r.precioBase),
            descuentoPorcentaje: r.descuentoPorcentaje == null ? null : Number(r.descuentoPorcentaje),
            cantidad: Number(r.cantidad)
        }))
    };
};

const obtenerStockVariante = async (connection, productoVarianteId) => {
    const [rows] = await connection.query(
        "SELECT STOCK, PRODUCTO_ID, PRECIO FROM PRODUCTO_VARIANTE WHERE IDVARIANTE = ? LIMIT 1",
        [productoVarianteId]
    );
    if (!rows.length) return null;
    return {
        stock: rows[0].STOCK == null ? null : Number(rows[0].STOCK),
        productoId: rows[0].PRODUCTO_ID,
        precio: rows[0].PRECIO == null ? null : Number(rows[0].PRECIO)
    };
};

const agregarItem = async (clienteId, productoVarianteId, cantidad) => {
    return await withTransaction(async (connection) => {
        const carritoId = (await obtenerCarritoActualId(clienteId)) || (await crearCarrito(connection, clienteId));
        const variant = await obtenerStockVariante(connection, productoVarianteId);
        if (!variant) {
            const err = new Error("Variante no encontrada.");
            err.statusCode = 404;
            throw err;
        }

        const [exist] = await connection.query(
            "SELECT IDCARRITO_DETALLE, CANTIDAD FROM CARRITO_DETALLE WHERE CARRITO_ID = ? AND PRODUCTO_VARIANTE_ID = ? LIMIT 1",
            [carritoId, productoVarianteId]
        );

        const cantidadActual = exist.length ? Number(exist[0].CANTIDAD) : 0;
        const nuevaCantidad = cantidadActual + Number(cantidad);
        if (variant.stock != null && nuevaCantidad > variant.stock) {
            const err = new Error("Stock insuficiente.");
            err.statusCode = 400;
            throw err;
        }

        if (exist.length) {
            await connection.query(
                "UPDATE CARRITO_DETALLE SET CANTIDAD = ? WHERE IDCARRITO_DETALLE = ?",
                [nuevaCantidad, exist[0].IDCARRITO_DETALLE]
            );
        } else {
            await connection.query(
                "INSERT INTO CARRITO_DETALLE (CARRITO_ID, PRODUCTO_VARIANTE_ID, CANTIDAD) VALUES (?, ?, ?)",
                [carritoId, productoVarianteId, nuevaCantidad]
            );
        }

        await tocarCarrito(connection, carritoId);
        return carritoId;
    });
};

const actualizarCantidadItem = async (clienteId, idDetalle, cantidad) => {
    return await withTransaction(async (connection) => {
        const carritoId = await obtenerCarritoActualId(clienteId);
        if (!carritoId) {
            const err = new Error("Carrito no encontrado.");
            err.statusCode = 404;
            throw err;
        }

        const [rows] = await connection.query(
            "SELECT PRODUCTO_VARIANTE_ID FROM CARRITO_DETALLE WHERE IDCARRITO_DETALLE = ? AND CARRITO_ID = ? LIMIT 1",
            [idDetalle, carritoId]
        );
        if (!rows.length) {
            const err = new Error("Item no encontrado.");
            err.statusCode = 404;
            throw err;
        }

        const productoVarianteId = rows[0].PRODUCTO_VARIANTE_ID;
        const variant = await obtenerStockVariante(connection, productoVarianteId);
        if (!variant) {
            const err = new Error("Variante no encontrada.");
            err.statusCode = 404;
            throw err;
        }

        const nuevaCantidad = Number(cantidad);
        if (variant.stock != null && nuevaCantidad > variant.stock) {
            const err = new Error("Stock insuficiente.");
            err.statusCode = 400;
            throw err;
        }

        if (nuevaCantidad <= 0) {
            await connection.query("DELETE FROM CARRITO_DETALLE WHERE IDCARRITO_DETALLE = ? AND CARRITO_ID = ?", [
                idDetalle,
                carritoId
            ]);
        } else {
            await connection.query("UPDATE CARRITO_DETALLE SET CANTIDAD = ? WHERE IDCARRITO_DETALLE = ? AND CARRITO_ID = ?", [
                nuevaCantidad,
                idDetalle,
                carritoId
            ]);
        }

        await tocarCarrito(connection, carritoId);
        return carritoId;
    });
};

const eliminarItem = async (clienteId, idDetalle) => {
    return await withTransaction(async (connection) => {
        const carritoId = await obtenerCarritoActualId(clienteId);
        if (!carritoId) {
            const err = new Error("Carrito no encontrado.");
            err.statusCode = 404;
            throw err;
        }

        await connection.query("DELETE FROM CARRITO_DETALLE WHERE IDCARRITO_DETALLE = ? AND CARRITO_ID = ?", [
            idDetalle,
            carritoId
        ]);
        await tocarCarrito(connection, carritoId);
        return carritoId;
    });
};

export const methods = {
    obtenerClienteIdPorUsuarioId,
    obtenerOCrearCarrito,
    obtenerCarrito,
    agregarItem,
    actualizarCantidadItem,
    eliminarItem
};
