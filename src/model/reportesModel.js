import { getConnection } from "./../database/conexcion";

const estadosPagados = [1, 2, 3, 4];

const normalizarRangoFechas = ({ desde, hasta }) => {
    const where = [];
    const params = [];

    if (desde) {
        where.push("v.CREATEDAT >= ?");
        params.push(`${String(desde).trim()} 00:00:00`);
    }
    if (hasta) {
        where.push("v.CREATEDAT <= ?");
        params.push(`${String(hasta).trim()} 23:59:59`);
    }

    return { whereSql: where.length ? ` AND ${where.join(" AND ")}` : "", params };
};

const obtenerReporteVentas = async ({ desde, hasta }) => {
    const pool = await getConnection();
    const { whereSql, params } = normalizarRangoFechas({ desde, hasta });

    const [resumenRows] = await pool.query(
        `SELECT
            COUNT(*) AS totalVentas,
            COALESCE(SUM(v.PRECIO_TOTAL), 0) AS totalIngresos,
            COALESCE(AVG(v.PRECIO_TOTAL), 0) AS ticketPromedio
         FROM VENTA v
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
         ${whereSql}`,
        [...estadosPagados, ...params]
    );

    const [porEstadoRows] = await pool.query(
        `SELECT
            v.ESTADO AS estado,
            COUNT(*) AS cantidad,
            COALESCE(SUM(v.PRECIO_TOTAL), 0) AS total
         FROM VENTA v
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
         ${whereSql}
         GROUP BY v.ESTADO
         ORDER BY v.ESTADO ASC`,
        [...estadosPagados, ...params]
    );

    const [porDiaRows] = await pool.query(
        `SELECT
            DATE(v.CREATEDAT) AS dia,
            COUNT(*) AS cantidad,
            COALESCE(SUM(v.PRECIO_TOTAL), 0) AS total
         FROM VENTA v
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
         ${whereSql}
         GROUP BY DATE(v.CREATEDAT)
         ORDER BY DATE(v.CREATEDAT) ASC`,
        [...estadosPagados, ...params]
    );

    const [topProductosRows] = await pool.query(
        `SELECT
            p.ID AS productoId,
            p.NOMBRE AS productoNombre,
            COALESCE(SUM(vd.CANTIDAD), 0) AS cantidadVendida,
            COALESCE(SUM(vd.CANTIDAD * vd.PRECIO_UNITARIO), 0) AS totalVendido
         FROM VENTA v
         INNER JOIN VENTA_DETALLE vd ON vd.VENTA_ID = v.IDVENTA
         INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = vd.PRODUCTO_VARIANTE_ID
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
         ${whereSql}
         GROUP BY p.ID, p.NOMBRE
         ORDER BY totalVendido DESC
         LIMIT 10`,
        [...estadosPagados, ...params]
    );

    const resumen = resumenRows[0] || { totalVentas: 0, totalIngresos: 0, ticketPromedio: 0 };

    return {
        resumen: {
            totalVentas: Number(resumen.totalVentas || 0),
            totalIngresos: Number(resumen.totalIngresos || 0),
            ticketPromedio: Number(resumen.ticketPromedio || 0)
        },
        porEstado: porEstadoRows.map((r) => ({
            estado: Number(r.estado),
            cantidad: Number(r.cantidad || 0),
            total: Number(r.total || 0)
        })),
        porDia: porDiaRows.map((r) => ({
            dia: r.dia,
            cantidad: Number(r.cantidad || 0),
            total: Number(r.total || 0)
        })),
        topProductos: topProductosRows.map((r) => ({
            productoId: Number(r.productoId),
            productoNombre: r.productoNombre,
            cantidadVendida: Number(r.cantidadVendida || 0),
            totalVendido: Number(r.totalVendido || 0)
        }))
    };
};

const obtenerDashboard = async ({ dias }) => {
    const pool = await getConnection();
    const nDias = Math.max(1, Math.min(30, Number(dias || 7)));

    const [productosRows] = await pool.query("SELECT COUNT(*) AS total FROM PRODUCTO WHERE ESTADO = 1");
    const [clientesRows] = await pool.query("SELECT COUNT(*) AS total FROM CLIENTE WHERE ESTADO = 1");
    const [ventasRows] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(PRECIO_TOTAL), 0) AS ingresos
         FROM VENTA
         WHERE ESTADO IN (${estadosPagados.map(() => "?").join(",")})`,
        estadosPagados
    );

    const [porDiaRows] = await pool.query(
        `SELECT
            DATE(v.CREATEDAT) AS dia,
            COUNT(*) AS cantidad,
            COALESCE(SUM(v.PRECIO_TOTAL), 0) AS total
         FROM VENTA v
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
           AND v.CREATEDAT >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(v.CREATEDAT)
         ORDER BY DATE(v.CREATEDAT) ASC`,
        [...estadosPagados, nDias]
    );

    const [porEstadoRows] = await pool.query(
        `SELECT
            v.ESTADO AS estado,
            COUNT(*) AS cantidad,
            COALESCE(SUM(v.PRECIO_TOTAL), 0) AS total
         FROM VENTA v
         WHERE v.ESTADO IN (${estadosPagados.map(() => "?").join(",")})
           AND v.CREATEDAT >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY v.ESTADO
         ORDER BY v.ESTADO ASC`,
        [...estadosPagados, nDias]
    );

    return {
        productosActivos: Number(productosRows?.[0]?.total || 0),
        clientesActivos: Number(clientesRows?.[0]?.total || 0),
        ventasPagadas: Number(ventasRows?.[0]?.total || 0),
        ingresosTotales: Number(ventasRows?.[0]?.ingresos || 0),
        porDia: porDiaRows.map((r) => ({
            dia: r.dia,
            cantidad: Number(r.cantidad || 0),
            total: Number(r.total || 0)
        })),
        porEstado: porEstadoRows.map((r) => ({
            estado: Number(r.estado),
            cantidad: Number(r.cantidad || 0),
            total: Number(r.total || 0)
        }))
    };
};

export const methods = {
    obtenerReporteVentas,
    obtenerDashboard
};

