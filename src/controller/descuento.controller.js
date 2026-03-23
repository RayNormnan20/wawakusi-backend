import { methods as descuentoModel } from "./../model/descuentoModel";

const parseNumero = (v) => {
    const n = Number(v);
    return isFinite(n) ? n : null;
};

const listarDescuentos = async (req, res) => {
    try {
        const rows = await descuentoModel.listarDescuentos();
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const crearDescuento = async (req, res) => {
    try {
        const { nombre, descripcion, porcentaje, fechaInicio, fechaFin, productoId } = req.body;
        const porc = parseNumero(porcentaje);
        const prodId = Number(productoId);

        if (!nombre || porc == null || !fechaInicio || !fechaFin || !isFinite(prodId)) {
            return res.status(400).json({ message: "Complete nombre, porcentaje, fechas y producto." });
        }

        await descuentoModel.crearDescuento({
            nombre,
            descripcion,
            porcentaje: porc,
            fechaInicio,
            fechaFin,
            productoId: prodId
        });

        res.json({ message: "Promoción registrada con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const actualizarDescuento = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, porcentaje, fechaInicio, fechaFin, productoId } = req.body;
        const porc = parseNumero(porcentaje);
        const prodId = productoId == null ? null : Number(productoId);

        if (!nombre || porc == null || !fechaInicio || !fechaFin) {
            return res.status(400).json({ message: "Complete nombre, porcentaje y fechas." });
        }

        await descuentoModel.actualizarDescuento(id, {
            nombre,
            descripcion,
            porcentaje: porc,
            fechaInicio,
            fechaFin,
            productoId: prodId != null && isFinite(prodId) ? prodId : null
        });

        res.json({ message: "Promoción actualizada con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const eliminarDescuento = async (req, res) => {
    try {
        const { id } = req.params;
        await descuentoModel.eliminarDescuento(id);
        res.json({ message: "Promoción eliminada con éxito" });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

export const methods = {
    listarDescuentos,
    crearDescuento,
    actualizarDescuento,
    eliminarDescuento
};
