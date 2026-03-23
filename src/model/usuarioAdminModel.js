import { getConnection } from "./../database/conexcion";

const existeUsuarioPorLogin = async (loginUsuario, excludeIdUsuario = null) => {
    const pool = await getConnection();
    if (excludeIdUsuario != null) {
        const [rows] = await pool.query(
            "SELECT IDUSUARIO FROM USUARIO WHERE USUARIO = ? AND IDUSUARIO <> ? LIMIT 1",
            [loginUsuario, excludeIdUsuario]
        );
        return rows.length ? rows[0].IDUSUARIO : null;
    }
    const [rows] = await pool.query("SELECT IDUSUARIO FROM USUARIO WHERE USUARIO = ? LIMIT 1", [loginUsuario]);
    return rows.length ? rows[0].IDUSUARIO : null;
};

const listarUsuariosConRol = async () => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            u.IDUSUARIO AS idUsuario,
            u.USUARIO AS usuario,
            u.ROL_ID AS rolId,
            r.NOMBRE AS rolNombre,
            u.ESTADO AS estado,
            u.CREATEDAT AS createdAt,
            u.UPDATEDAT AS updatedAt
         FROM USUARIO u
         LEFT JOIN ROL r ON r.IDROL = u.ROL_ID
         ORDER BY u.IDUSUARIO DESC`
    );
    return rows;
};

const obtenerUsuarioConRol = async (idUsuario) => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            u.IDUSUARIO AS idUsuario,
            u.USUARIO AS usuario,
            u.ROL_ID AS rolId,
            r.NOMBRE AS rolNombre,
            u.ESTADO AS estado,
            u.CREATEDAT AS createdAt,
            u.UPDATEDAT AS updatedAt
         FROM USUARIO u
         LEFT JOIN ROL r ON r.IDROL = u.ROL_ID
         WHERE u.IDUSUARIO = ?
         LIMIT 1`,
        [idUsuario]
    );
    return rows[0] || null;
};

const crearUsuario = async ({ usuario, passwordHash, rolId, estado }) => {
    const pool = await getConnection();
    const now = new Date();
    const [result] = await pool.query(
        `INSERT INTO USUARIO (USUARIO, PASSWORD, ROL_ID, ESTADO, CREATEDAT, UPDATEDAT)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [usuario, passwordHash, rolId, estado === undefined ? 1 : estado, now, now]
    );
    return result.insertId;
};

const actualizarUsuario = async (idUsuario, updates) => {
    const pool = await getConnection();
    const payload = { ...updates, UPDATEDAT: new Date() };
    await pool.query("UPDATE USUARIO SET ? WHERE IDUSUARIO = ?", [payload, idUsuario]);
};

export const methods = {
    existeUsuarioPorLogin,
    listarUsuariosConRol,
    obtenerUsuarioConRol,
    crearUsuario,
    actualizarUsuario
};

