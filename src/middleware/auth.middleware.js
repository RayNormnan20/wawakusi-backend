import jwt from "jsonwebtoken";
import config from "../config";
import { getConnection } from "../database/conexcion";

const getBearerToken = (req) => {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) return null;
    return token;
};

const loadAuthContext = async (idUsuario) => {
    const connection = await getConnection();
    const [rows] = await connection.query(
        `SELECT u.IDUSUARIO, u.USUARIO, u.ROL_ID, u.ESTADO, r.NOMBRE AS ROL_NOMBRE
         FROM USUARIO u
         LEFT JOIN ROL r ON r.IDROL = u.ROL_ID
         WHERE u.IDUSUARIO = ?
         LIMIT 1`,
        [idUsuario]
    );

    if (rows.length === 0) return null;
    const usuario = rows[0];

    let permisos = [];
    if (usuario.ROL_ID) {
        const [permRows] = await connection.query(
            `SELECT p.NOMBRE
             FROM PERMISO p
             INNER JOIN ROL_PERMISO rp ON rp.PERMISO_ID = p.IDPERMISO
             WHERE rp.ROL_ID = ?`,
            [usuario.ROL_ID]
        );
        permisos = permRows.map((p) => p.NOMBRE);
    }

    return {
        idUsuario: usuario.IDUSUARIO,
        usuario: usuario.USUARIO,
        rolId: usuario.ROL_ID,
        rolNombre: usuario.ROL_NOMBRE,
        estado: usuario.ESTADO,
        permisos
    };
};

export const requireAuth = async (req, res, next) => {
    try {
        const token = getBearerToken(req);
        if (!token) return res.status(401).json({ rpta: false, mensaje: "No autenticado." });

        const decoded = jwt.verify(token, config.jwtSecret);
        const auth = await loadAuthContext(decoded.sub);

        if (!auth) return res.status(401).json({ rpta: false, mensaje: "Sesión inválida." });
        if (!auth.estado) return res.status(401).json({ rpta: false, mensaje: "Usuario inactivo." });

        req.auth = auth;
        next();
    } catch (error) {
        if (error?.name === "TokenExpiredError") {
            return res.status(401).json({ rpta: false, mensaje: "Sesión expirada." });
        }
        return res.status(401).json({ rpta: false, mensaje: "Token inválido." });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            req.auth = null;
            return next();
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        const auth = await loadAuthContext(decoded.sub);

        if (!auth || !auth.estado) {
            req.auth = null;
            return next();
        }

        req.auth = auth;
        next();
    } catch {
        req.auth = null;
        next();
    }
};

export const requireRole = (rolNombre) => (req, res, next) => {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ rpta: false, mensaje: "No autenticado." });
    if (auth.rolNombre !== rolNombre) return res.status(403).json({ rpta: false, mensaje: "No autorizado." });
    next();
};

export const requirePermission = (permiso) => (req, res, next) => {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ rpta: false, mensaje: "No autenticado." });
    if (!auth.permisos?.includes(permiso)) return res.status(403).json({ rpta: false, mensaje: "No autorizado." });
    next();
};

