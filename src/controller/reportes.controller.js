import { methods as reportesModel } from "./../model/reportesModel";

const getReporteVentas = async (req, res) => {
    try {
        const { desde, hasta } = req.query || {};
        const result = await reportesModel.obtenerReporteVentas({
            desde: desde ? String(desde) : null,
            hasta: hasta ? String(hasta) : null
        });
        return res.json({ rpta: true, ...result });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({ rpta: false, mensaje: error.message || "Error al obtener reportes." });
    }
};

const getDashboard = async (req, res) => {
    try {
        const dias = req.query?.dias;
        const result = await reportesModel.obtenerDashboard({ dias });
        return res.json({ rpta: true, ...result });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({ rpta: false, mensaje: error.message || "Error al obtener dashboard." });
    }
};

export const methods = {
    getReporteVentas,
    getDashboard
};
