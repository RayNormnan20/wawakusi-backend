import { getConnection } from "./../database/conexcion";

const listarVentasCliente = async (clienteId) => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            v.IDVENTA AS idVenta,
            v.CODIGO AS codigo,
            v.PRECIO_TOTAL AS total,
            v.ESTADO AS estado,
            v.CREATEDAT AS createdAt,
            e.ESTADO AS envioEstado,
            e.DIRECCION AS direccionEnvio,
            pa.ESTADO AS pagoEstado,
            mp.NOMBRE AS metodoPago
         FROM VENTA v
         LEFT JOIN ENVIO e ON e.VENTA_ID = v.IDVENTA
         LEFT JOIN PAGO pa ON pa.VENTA_ID = v.IDVENTA
         LEFT JOIN METODO_PAGO mp ON mp.IDMETODO_PAGO = pa.METODO_PAGO_ID
         WHERE v.CLIENTE_ID = ?
         ORDER BY v.IDVENTA DESC`,
        [clienteId]
    );
    if (!rows.length) return [];

    const ventaIds = rows.map((r) => r.idVenta).filter((v) => v != null);
    const placeholders = ventaIds.map(() => "?").join(",");
    const [detRows] = await pool.query(
        `SELECT
            vd.VENTA_ID AS ventaId,
            vd.CANTIDAD AS cantidad,
            vd.PRECIO_UNITARIO AS precioUnitario,
            pv.TALLA AS talla,
            pv.COLOR AS color,
            p.NOMBRE AS productoNombre,
            p.IMAGEN AS imagen
         FROM VENTA_DETALLE vd
         INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = vd.PRODUCTO_VARIANTE_ID
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         WHERE vd.VENTA_ID IN (${placeholders})
         ORDER BY vd.IDVENTA_DETALLE ASC`,
        ventaIds
    );

    const detallesPorVenta = new Map();
    for (const d of detRows) {
        const arr = detallesPorVenta.get(d.ventaId) || [];
        arr.push({
            productoNombre: d.productoNombre,
            imagen: d.imagen,
            talla: d.talla,
            color: d.color,
            cantidad: Number(d.cantidad),
            precioUnitario: d.precioUnitario == null ? null : Number(d.precioUnitario)
        });
        detallesPorVenta.set(d.ventaId, arr);
    }

    return rows.map((v) => {
        const detalles = detallesPorVenta.get(v.idVenta) || [];
        const totalItems = detalles.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
        return {
            ...v,
            detalles,
            totalItems
        };
    });
};

const listarVentasAdmin = async () => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            v.IDVENTA AS idVenta,
            v.CODIGO AS codigo,
            v.PRECIO_TOTAL AS total,
            v.ESTADO AS estado,
            v.CREATEDAT AS createdAt,
            e.ESTADO AS envioEstado,
            e.DIRECCION AS direccionEnvio,
            pa.ESTADO AS pagoEstado,
            mp.NOMBRE AS metodoPago,
            c.ID AS clienteId,
            c.NOMBRE AS clienteNombre,
            c.EMAIL AS clienteEmail,
            c.TELEFONO AS clienteTelefono
         FROM VENTA v
         INNER JOIN CLIENTE c ON c.ID = v.CLIENTE_ID
         LEFT JOIN ENVIO e ON e.VENTA_ID = v.IDVENTA
         LEFT JOIN PAGO pa ON pa.VENTA_ID = v.IDVENTA
         LEFT JOIN METODO_PAGO mp ON mp.IDMETODO_PAGO = pa.METODO_PAGO_ID
         ORDER BY v.IDVENTA DESC`
    );
    if (!rows.length) return [];

    const ventaIds = rows.map((r) => r.idVenta).filter((v) => v != null);
    const placeholders = ventaIds.map(() => "?").join(",");
    const [detRows] = await pool.query(
        `SELECT
            vd.VENTA_ID AS ventaId,
            vd.CANTIDAD AS cantidad,
            vd.PRECIO_UNITARIO AS precioUnitario,
            pv.TALLA AS talla,
            pv.COLOR AS color,
            p.NOMBRE AS productoNombre,
            p.IMAGEN AS imagen
         FROM VENTA_DETALLE vd
         INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = vd.PRODUCTO_VARIANTE_ID
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         WHERE vd.VENTA_ID IN (${placeholders})
         ORDER BY vd.IDVENTA_DETALLE ASC`,
        ventaIds
    );

    const detallesPorVenta = new Map();
    for (const d of detRows) {
        const arr = detallesPorVenta.get(d.ventaId) || [];
        arr.push({
            productoNombre: d.productoNombre,
            imagen: d.imagen,
            talla: d.talla,
            color: d.color,
            cantidad: Number(d.cantidad),
            precioUnitario: d.precioUnitario == null ? null : Number(d.precioUnitario)
        });
        detallesPorVenta.set(d.ventaId, arr);
    }

    return rows.map((v) => {
        const detalles = detallesPorVenta.get(v.idVenta) || [];
        const totalItems = detalles.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
        return {
            ...v,
            detalles,
            totalItems
        };
    });
};

const actualizarEstadoVenta = async (idVenta, estado) => {
    const pool = await getConnection();
    await pool.query("UPDATE VENTA SET ESTADO = ?, UPDATEDAT = ? WHERE IDVENTA = ?", [estado, new Date(), idVenta]);
};

const actualizarEstadoPedidoPorVenta = async (idVenta, estado) => {
    const pool = await getConnection();
    const [rows] = await pool.query("SELECT PEDIDO_ID FROM VENTA WHERE IDVENTA = ? LIMIT 1", [idVenta]);
    if (!rows.length) return null;
    await pool.query("UPDATE PEDIDO SET ESTADO = ?, UPDATEDAT = ? WHERE IDPEDIDO = ?", [estado, new Date(), rows[0].PEDIDO_ID]);
    return rows[0].PEDIDO_ID;
};

const actualizarEnvioPorVenta = async (idVenta, envioEstado, fechaEnvioNullable) => {
    const pool = await getConnection();
    await pool.query("UPDATE ENVIO SET ESTADO = ?, FECHA_ENVIO = ?, UPDATEDAT = ? WHERE VENTA_ID = ?", [
        envioEstado,
        fechaEnvioNullable,
        new Date(),
        idVenta
    ]);
};

export const methods = {
    listarVentasCliente,
    listarVentasAdmin,
    actualizarEstadoVenta,
    actualizarEstadoPedidoPorVenta,
    actualizarEnvioPorVenta
};
