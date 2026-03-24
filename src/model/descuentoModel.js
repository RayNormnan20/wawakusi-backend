import { getConnection } from "./../database/conexcion";

const parseFechaInicio = (v) => {
    if (!v) return null;
    if (typeof v === "string" && v.length === 10) return `${v} 00:00:00`;
    return v;
};

const parseFechaFin = (v) => {
    if (!v) return null;
    if (typeof v === "string" && v.length === 10) return `${v} 23:59:59`;
    return v;
};

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

const listarDescuentos = async () => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            d.IDDESCUENTO AS id,
            d.NOMBRE AS nombre,
            d.DESCRIPCION AS descripcion,
            d.PORCENTAJE AS porcentaje,
            d.FECHA_INICIO AS fechaInicio,
            d.FECHA_FIN AS fechaFin,
            d.ESTADO AS estado,
            p.ID AS productoId,
            p.NOMBRE AS productoNombre
         FROM DESCUENTO d
         LEFT JOIN PRODUCTO_DESCUENTO pd ON pd.DESCUENTO_ID = d.IDDESCUENTO
         LEFT JOIN PRODUCTO p ON p.ID = pd.PRODUCTO_ID
         ORDER BY d.ESTADO DESC, d.FECHA_FIN ASC, d.IDDESCUENTO DESC`
    );
    return rows;
};

const crearDescuento = async ({ nombre, descripcion, porcentaje, fechaInicio, fechaFin, productoId }) => {
    const now = new Date();
    const fi = parseFechaInicio(fechaInicio);
    const ff = parseFechaFin(fechaFin);

    const result = await withTransaction(async (connection) => {
        const [ins] = await connection.execute(
            `INSERT INTO DESCUENTO (NOMBRE, DESCRIPCION, PORCENTAJE, FECHA_INICIO, FECHA_FIN, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre, descripcion || null, porcentaje, fi, ff, 1, now, now]
        );
        const idDescuento = ins.insertId;

        await connection.execute(
            `INSERT INTO PRODUCTO_DESCUENTO (PRODUCTO_ID, DESCUENTO_ID)
             VALUES (?, ?)`,
            [productoId, idDescuento]
        );

        return idDescuento;
    });

    return result;
};

const actualizarDescuento = async (id, { nombre, descripcion, porcentaje, fechaInicio, fechaFin, productoId }) => {
    const now = new Date();
    const fi = parseFechaInicio(fechaInicio);
    const ff = parseFechaFin(fechaFin);

    await withTransaction(async (connection) => {
        await connection.execute(
            `UPDATE DESCUENTO
             SET NOMBRE = ?, DESCRIPCION = ?, PORCENTAJE = ?, FECHA_INICIO = ?, FECHA_FIN = ?, UPDATEDAT = ?
             WHERE IDDESCUENTO = ?`,
            [nombre, descripcion || null, porcentaje, fi, ff, now, id]
        );

        if (productoId != null) {
            await connection.execute("DELETE FROM PRODUCTO_DESCUENTO WHERE DESCUENTO_ID = ?", [id]);
            await connection.execute(
                `INSERT INTO PRODUCTO_DESCUENTO (PRODUCTO_ID, DESCUENTO_ID)
                 VALUES (?, ?)`,
                [productoId, id]
            );
        }
    });
};

const eliminarDescuento = async (id) => {
    await withTransaction(async (connection) => {
        await connection.execute("UPDATE DESCUENTO SET ESTADO = 0, UPDATEDAT = ? WHERE IDDESCUENTO = ?", [new Date(), id]);
    });
};

const actualizarEstadoDescuento = async (id, estado) => {
    const now = new Date();
    const pool = await getConnection();
    await pool.query("UPDATE DESCUENTO SET ESTADO = ?, UPDATEDAT = ? WHERE IDDESCUENTO = ?", [estado, now, id]);
};

export const methods = {
    listarDescuentos,
    crearDescuento,
    actualizarDescuento,
    eliminarDescuento,
    actualizarEstadoDescuento
};

