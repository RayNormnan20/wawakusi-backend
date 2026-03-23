import { methods as carritoModel } from "./../model/carritoModel";

const getMiCarrito = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const carrito = await carritoModel.obtenerCarrito(clienteId);
        const total = carrito.items.reduce((acc, it) => acc + (Number(it.precioUnitario || 0) * Number(it.cantidad || 0)), 0);

        res.json({ rpta: true, carritoId: carrito.carritoId, items: carrito.items, total: Number(total.toFixed(2)) });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const addMiCarritoItem = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const { productoVarianteId, cantidad } = req.body || {};
        const pvId = Number(productoVarianteId);
        const qty = Number(cantidad);

        if (!isFinite(pvId) || !isFinite(qty) || qty <= 0) {
            return res.status(400).json({ rpta: false, mensaje: "Complete productoVarianteId y cantidad válida." });
        }

        await carritoModel.agregarItem(clienteId, pvId, qty);
        res.json({ rpta: true, mensaje: "Producto agregado al carrito." });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status !== 500) return res.status(status).json({ rpta: false, mensaje: error.message });
        res.status(500).send(error.message);
    }
};

const updateMiCarritoItem = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const { idDetalle } = req.params;
        const { cantidad } = req.body || {};
        const detId = Number(idDetalle);
        const qty = Number(cantidad);

        if (!isFinite(detId) || !isFinite(qty)) {
            return res.status(400).json({ rpta: false, mensaje: "Complete cantidad válida." });
        }

        await carritoModel.actualizarCantidadItem(clienteId, detId, qty);
        res.json({ rpta: true, mensaje: "Carrito actualizado." });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status !== 500) return res.status(status).json({ rpta: false, mensaje: error.message });
        res.status(500).send(error.message);
    }
};

const deleteMiCarritoItem = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const { idDetalle } = req.params;
        const detId = Number(idDetalle);
        if (!isFinite(detId)) return res.status(400).json({ rpta: false, mensaje: "Id inválido." });

        await carritoModel.eliminarItem(clienteId, detId);
        res.json({ rpta: true, mensaje: "Producto eliminado del carrito." });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status !== 500) return res.status(status).json({ rpta: false, mensaje: error.message });
        res.status(500).send(error.message);
    }
};

export const methods = {
    getMiCarrito,
    addMiCarritoItem,
    updateMiCarritoItem,
    deleteMiCarritoItem
};

