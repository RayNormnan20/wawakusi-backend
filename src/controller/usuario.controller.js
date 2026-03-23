// usuario.controller.js
import { getConnection } from "./../database/conexcion";
import bcrypt from "bcryptjs";
import { methods as usuarioAdminModel } from "./../model/usuarioAdminModel";

const getUsuarios = async (req, res) => {
    try {
        const rows = await usuarioAdminModel.listarUsuariosConRol();
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const getUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const row = await usuarioAdminModel.obtenerUsuarioConRol(id);
        res.json(row ? [row] : []);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const addUsuario = async (req, res) => {
    try {
        const { usuario, password, rolId, estado } = req.body || {};
        const loginUsuario = (usuario || "").trim().toLowerCase();

        if (!loginUsuario || !password || !rolId) {
            return res.status(400).json({ rpta: false, mensaje: "Complete usuario, password y rolId." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const existsId = await usuarioAdminModel.existeUsuarioPorLogin(loginUsuario);
        if (existsId) return res.status(409).json({ rpta: false, mensaje: "El usuario ya existe." });

        await usuarioAdminModel.crearUsuario({
            usuario: loginUsuario,
            passwordHash: Buffer.from(passwordHash),
            rolId,
            estado
        });

        res.json({ rpta: true, mensaje: "Usuario creado." });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const updateUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario, password, rolId, estado } = req.body || {};

        const updates = {};
        if (usuario !== undefined) updates.USUARIO = String(usuario).trim().toLowerCase();
        if (rolId !== undefined) updates.ROL_ID = rolId;
        if (estado !== undefined) updates.ESTADO = estado;
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            updates.PASSWORD = Buffer.from(passwordHash);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ rpta: false, mensaje: "No hay campos para actualizar." });
        }

        if (updates.USUARIO) {
            const existsId = await usuarioAdminModel.existeUsuarioPorLogin(updates.USUARIO, id);
            if (existsId) return res.status(409).json({ rpta: false, mensaje: "El usuario ya existe." });
        }

        await usuarioAdminModel.actualizarUsuario(id, updates);
        res.json({ rpta: true, mensaje: "Usuario actualizado." });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const deleteUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        await usuarioAdminModel.actualizarUsuario(id, { ESTADO: 0 });
        res.json({ rpta: true, mensaje: "Usuario desactivado." });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const getMe = async (req, res) => {
    try {
        const connection = await getConnection();
        const idUsuario = req.auth.idUsuario;

        const [rows] = await connection.query(
            `SELECT u.IDUSUARIO, u.USUARIO, u.ROL_ID, u.ESTADO, r.NOMBRE AS ROL_NOMBRE,
                    c.ID AS CLIENTE_ID, c.NOMBRE AS CLIENTE_NOMBRE, c.TELEFONO, c.EMAIL, c.DIRECCION
             FROM USUARIO u
             LEFT JOIN ROL r ON r.IDROL = u.ROL_ID
             LEFT JOIN CLIENTE c ON c.IDUSUARIO = u.IDUSUARIO
             WHERE u.IDUSUARIO = ?
             LIMIT 1`,
            [idUsuario]
        );

        if (!rows.length) return res.status(404).json({ rpta: false, mensaje: "Usuario no encontrado." });

        const me = rows[0];
        res.json({
            rpta: true,
            usuario: {
                idUsuario: me.IDUSUARIO,
                usuario: me.USUARIO,
                rolId: me.ROL_ID,
                rolNombre: me.ROL_NOMBRE,
                estado: me.ESTADO
            },
            cliente: me.CLIENTE_ID
                ? {
                      id: me.CLIENTE_ID,
                      nombre: me.CLIENTE_NOMBRE,
                      telefono: me.TELEFONO,
                      email: me.EMAIL,
                      direccion: me.DIRECCION
                  }
                : null,
            permisos: req.auth.permisos
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const updateMe = async (req, res) => {
    const { nombre, telefono, email, direccion, usuario, password } = req.body || {};
    const idUsuario = req.auth.idUsuario;
    const now = new Date();

    let connection;
    try {
        const pool = await getConnection();
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const userUpdates = {};
        const newUsuario = usuario !== undefined ? String(usuario).trim().toLowerCase() : null;
        const newEmail = email !== undefined ? String(email).trim().toLowerCase() : null;
        const loginUsuario = newUsuario || newEmail;

        if (loginUsuario) {
            const [exists] = await connection.query(
                "SELECT IDUSUARIO FROM USUARIO WHERE USUARIO = ? AND IDUSUARIO <> ? LIMIT 1",
                [loginUsuario, idUsuario]
            );
            if (exists.length) {
                await connection.rollback();
                return res.status(409).json({ rpta: false, mensaje: "El usuario/email ya está en uso." });
            }
            userUpdates.USUARIO = loginUsuario;
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            userUpdates.PASSWORD = Buffer.from(passwordHash);
        }

        if (Object.keys(userUpdates).length) {
            userUpdates.UPDATEDAT = now;
            await connection.query("UPDATE USUARIO SET ? WHERE IDUSUARIO = ?", [userUpdates, idUsuario]);
        }

        const [clienteRows] = await connection.query("SELECT ID FROM CLIENTE WHERE IDUSUARIO = ? LIMIT 1", [idUsuario]);
        if (clienteRows.length) {
            const clienteUpdates = {};
            if (nombre !== undefined) clienteUpdates.NOMBRE = nombre;
            if (telefono !== undefined) clienteUpdates.TELEFONO = telefono;
            if (newEmail !== null) clienteUpdates.EMAIL = newEmail;
            if (direccion !== undefined) clienteUpdates.DIRECCION = direccion;

            if (Object.keys(clienteUpdates).length) {
                clienteUpdates.UPDATEDAT = now;
                await connection.query("UPDATE CLIENTE SET ? WHERE IDUSUARIO = ?", [clienteUpdates, idUsuario]);
            }
        } else {
            const clienteUpdates = {};
            if (nombre !== undefined) clienteUpdates.NOMBRE = nombre;
            if (telefono !== undefined) clienteUpdates.TELEFONO = telefono;
            if (newEmail !== null) clienteUpdates.EMAIL = newEmail;
            if (direccion !== undefined) clienteUpdates.DIRECCION = direccion;

            if (Object.keys(clienteUpdates).length) {
                clienteUpdates.ESTADO = 1;
                clienteUpdates.CREATEDAT = now;
                clienteUpdates.UPDATEDAT = now;
                clienteUpdates.IDUSUARIO = idUsuario;
                if (clienteUpdates.NOMBRE === undefined) clienteUpdates.NOMBRE = loginUsuario || "Usuario";
                await connection.query("INSERT INTO CLIENTE SET ?", clienteUpdates);
            }
        }

        await connection.commit();
        res.json({ rpta: true, mensaje: "Perfil actualizado." });
    } catch (error) {
        try {
            if (connection) await connection.rollback();
        } catch {}
        res.status(500).send(error.message);
    } finally {
        try {
            if (connection) connection.release();
        } catch {}
    }
};

export const methods = {
    getUsuarios,
    getUsuario,
    addUsuario,
    updateUsuario,
    deleteUsuario,
    getMe,
    updateMe
};
