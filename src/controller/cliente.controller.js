// cliente.controller.js
import { getConnection } from "./../database/conexcion";

const getClientes = async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.query(
            "SELECT ID, NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, IDUSUARIO, CREATEDAT, UPDATEDAT FROM CLIENTE"
        );
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};


const getCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await getConnection();
        const [rows] = await connection.query(
            "SELECT ID, NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, IDUSUARIO, CREATEDAT, UPDATEDAT FROM CLIENTE WHERE ID = ?",
            [id]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const addCliente = async (req, res) => {
    try {
        const { nombre, telefono, email, direccion, idUsuario } = req.body || {};

        if (!nombre || !idUsuario) {
            return res.status(400).json({ rpta: false, mensaje: "Complete nombre e idUsuario." });
        }

        const now = new Date();
        const cliente = {
            NOMBRE: nombre,
            TELEFONO: telefono || null,
            EMAIL: email ? String(email).trim().toLowerCase() : null,
            DIRECCION: direccion || null,
            ESTADO: 1,
            CREATEDAT: now,
            UPDATEDAT: now,
            IDUSUARIO: idUsuario
        };
        const connection = await getConnection();
        await connection.query("INSERT INTO CLIENTE SET ?", cliente);
        res.json({ rpta: true, mensaje: "Cliente agregado" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const updateCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, email, direccion, estado } = req.body || {};

        const cliente = {};
        if (nombre !== undefined) cliente.NOMBRE = nombre;
        if (telefono !== undefined) cliente.TELEFONO = telefono;
        if (email !== undefined) cliente.EMAIL = email ? String(email).trim().toLowerCase() : null;
        if (direccion !== undefined) cliente.DIRECCION = direccion;
        if (estado !== undefined) cliente.ESTADO = estado;
        cliente.UPDATEDAT = new Date();

        const connection = await getConnection();
        const result = await connection.query("UPDATE CLIENTE SET ? WHERE ID = ?", [cliente, id]);
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const deleteCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await getConnection();
        const result = await connection.query("UPDATE CLIENTE SET ESTADO = 0, UPDATEDAT = ? WHERE ID = ?", [
            new Date(),
            id
        ]);
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

export const methods = {
    getClientes,
    getCliente,
    addCliente,
    updateCliente,
    deleteCliente
};
