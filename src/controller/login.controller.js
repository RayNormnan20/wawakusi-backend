import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../config";
import { getConnection } from "./../database/conexcion";

const getRoleIdByName = async (nombre) => {
    const connection = await getConnection();
    const [rows] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = ? LIMIT 1", [nombre]);
    return rows.length ? rows[0].IDROL : null;
};

const findUsuarioByUsuario = async (usuario) => {
    const connection = await getConnection();
    const [rows] = await connection.query(
        `SELECT u.IDUSUARIO, u.USUARIO, u.PASSWORD, u.ROL_ID, u.ESTADO, r.NOMBRE AS ROL_NOMBRE
         FROM USUARIO u
         LEFT JOIN ROL r ON r.IDROL = u.ROL_ID
         WHERE u.USUARIO = ?
         LIMIT 1`,
        [usuario]
    );
    return rows.length ? rows[0] : null;
};

const getPermisosByRolId = async (rolId) => {
    const connection = await getConnection();
    const [rows] = await connection.query(
        `SELECT p.NOMBRE
         FROM PERMISO p
         INNER JOIN ROL_PERMISO rp ON rp.PERMISO_ID = p.IDPERMISO
         WHERE rp.ROL_ID = ?`,
        [rolId]
    );
    return rows.map((r) => r.NOMBRE);
};

const buildVistas = (auth) => {
    const vistasPublicas = [
        { codigo: "CUS01", nombre: "Registrarse" },
        { codigo: "CUS02", nombre: "Iniciar sesión" },
        { codigo: "CUS03", nombre: "Navegar catálogo" },
        { codigo: "CUS04", nombre: "Ver detalle producto" }
    ];

    if (!auth) return { publico: true, vistas: vistasPublicas };

    const permisos = new Set(auth.permisos || []);
    const vistas = [...vistasPublicas];

    vistas.push({ codigo: "CUS09", nombre: "Editar perfil" });

    if (permisos.has("VER_CARRITO")) {
        vistas.push({ codigo: "CUS06", nombre: "Gestionar carrito" });
    }
    if (permisos.has("COMPRAR")) {
        vistas.push({ codigo: "CUS07", nombre: "Realizar compra" });
        vistas.push({ codigo: "CUS08", nombre: "Consultar pedido" });
        vistas.push({ codigo: "CUS05", nombre: "Agregar al carrito" });
    }

    if (permisos.has("CREAR_PRODUCTO") || permisos.has("EDITAR_PRODUCTO") || permisos.has("ELIMINAR_PRODUCTO")) {
        vistas.push({ codigo: "CUS11", nombre: "Gestionar productos" });
    }
    if (permisos.has("GESTIONAR_PEDIDOS")) {
        vistas.push({ codigo: "CUS12", nombre: "Gestionar pedidos" });
    }
    if (permisos.has("VER_REPORTES")) {
        vistas.push({ codigo: "CUS13", nombre: "Visualizar reportes" });
    }

    if (auth.rolNombre === "ADMIN") {
        vistas.push({ codigo: "CUS10", nombre: "Iniciar sesión admin" });
    }

    const unique = new Map();
    for (const v of vistas) unique.set(v.codigo, v);

    return { publico: false, vistas: Array.from(unique.values()) };
};

const registerCliente = async (req, res) => {
    const { nombre, telefono, email, direccion, usuario, password } = req.body || {};

    const loginUsuario = (usuario || email || "").trim().toLowerCase();
    const clienteEmail = (email || "").trim().toLowerCase();

    if (!nombre || !loginUsuario || !clienteEmail || !password) {
        return res.status(400).json({ rpta: false, mensaje: "Complete nombre, email/usuario y contraseña." });
    }

    const pool = await getConnection();
    const now = new Date();

    const rolClienteId = await getRoleIdByName("CLIENTE");
    if (!rolClienteId) return res.status(500).json({ rpta: false, mensaje: "No existe el rol CLIENTE." });

    const existing = await findUsuarioByUsuario(loginUsuario);
    if (existing) return res.status(409).json({ rpta: false, mensaje: "El usuario ya existe." });

    const passwordHash = await bcrypt.hash(password, 10);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [insertUsuario] = await connection.query(
            `INSERT INTO USUARIO (USUARIO, PASSWORD, ROL_ID, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [loginUsuario, Buffer.from(passwordHash), rolClienteId, 1, now, now]
        );

        const idUsuario = insertUsuario.insertId;

        await connection.query(
            `INSERT INTO CLIENTE (NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, CREATEDAT, UPDATEDAT, IDUSUARIO)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre, telefono || null, clienteEmail, direccion || null, 1, now, now, idUsuario]
        );

        await connection.commit();

        const permisos = await getPermisosByRolId(rolClienteId);
        const token = jwt.sign({ sub: idUsuario }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

        return res.json({
            rpta: true,
            mensaje: "Cliente registrado.",
            token,
            auth: {
                idUsuario,
                usuario: loginUsuario,
                rolId: rolClienteId,
                rolNombre: "CLIENTE",
                permisos
            }
        });
    } catch (error) {
        await connection.rollback();
        return res.status(500).json({ rpta: false, mensaje: error.message });
    } finally {
        connection.release();
    }
};

const login = async (req, res) => {
    try {
        const { usuario, email, password } = req.body || {};
        const loginUsuario = (usuario || email || "").trim().toLowerCase();

        if (!loginUsuario || !password) {
            return res.status(400).json({ rpta: false, mensaje: "Por favor, proporcione usuario/email y contraseña." });
        }

        const row = await findUsuarioByUsuario(loginUsuario);
        if (!row) return res.status(401).json({ rpta: false, mensaje: "Credenciales inválidas." });
        if (!row.ESTADO) return res.status(401).json({ rpta: false, mensaje: "Usuario inactivo." });

        const passwordHash = Buffer.isBuffer(row.PASSWORD) ? row.PASSWORD.toString("utf8") : String(row.PASSWORD || "");
        const ok = await bcrypt.compare(password, passwordHash);
        if (!ok) return res.status(401).json({ rpta: false, mensaje: "Credenciales inválidas." });

        const permisos = row.ROL_ID ? await getPermisosByRolId(row.ROL_ID) : [];
        const token = jwt.sign({ sub: row.IDUSUARIO }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

        return res.json({
            rpta: true,
            mensaje: "Usuario autenticado.",
            token,
            auth: {
                idUsuario: row.IDUSUARIO,
                usuario: row.USUARIO,
                rolId: row.ROL_ID,
                rolNombre: row.ROL_NOMBRE,
                permisos
            }
        });
    } catch (error) {
        return res.status(500).json({ rpta: false, mensaje: error.message });
    }
};

const getVistas = async (req, res) => {
    const auth = req.auth;
    return res.json({
        rpta: true,
        ...buildVistas(auth),
        rol: auth?.rolNombre || null,
        permisos: auth?.permisos || []
    });
};

export const methods = {
    login,
    registerCliente,
    getVistas
};
