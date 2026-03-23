import { methods as checkoutModel } from "./../model/checkoutModel";

const crearCheckoutPaypal = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const { direccionEnvio } = req.body || {};

        const result = await checkoutModel.crearCheckoutPaypal({
            idUsuario,
            direccionEnvio,
            currencyCode: "USD"
        });

        res.json({
            rpta: true,
            mensaje: "Checkout creado. Complete el pago en PayPal.",
            paypalOrderId: result.paypalOrderId,
            approvalUrl: result.approvalUrl
        });
    } catch (error) {
        console.error("[checkout/paypal/create]", {
            message: error?.message,
            statusCode: error?.statusCode,
            hasPayload: Boolean(error?.payload)
        });
        const status = error.statusCode || 500;
        return res.status(status).json({ rpta: false, mensaje: error.message || "Error al iniciar checkout." });
    }
};

const capturarPaypal = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const { paypalOrderId, checkoutContext } = req.body || {};
        if (!paypalOrderId) return res.status(400).json({ rpta: false, mensaje: "paypalOrderId inválido." });

        const result = await checkoutModel.capturarPaypalYCrearVenta({
            idUsuario,
            paypalOrderId,
            checkoutContext
        });

        res.json({
            rpta: true,
            mensaje: "Pago confirmado.",
            ventaId: result.ventaId,
            codigo: result.codigo
        });
    } catch (error) {
        console.error("[checkout/paypal/capture]", {
            message: error?.message,
            statusCode: error?.statusCode,
            hasPayload: Boolean(error?.payload)
        });
        const status = error.statusCode || 500;
        return res.status(status).json({ rpta: false, mensaje: error.message || "Error al confirmar pago." });
    }
};

export const methods = {
    crearCheckoutPaypal,
    capturarPaypal
};
