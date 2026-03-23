import { methods as carritoModel } from "./../model/carritoModel";
import { methods as ventaModel } from "./../model/ventaModel";
import { methods as checkoutModel } from "./../model/checkoutModel";
import { getConnection } from "./../database/conexcion";

const listarMisVentas = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const rows = await ventaModel.listarVentasCliente(clienteId);
        res.json({ rpta: true, ventas: rows });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const listarVentasAdmin = async (req, res) => {
    try {
        const rows = await ventaModel.listarVentasAdmin();
        res.json({ rpta: true, ventas: rows });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

const consultarPedidoPorCodigo = async (req, res) => {
    try {
        const idUsuario = req.auth.idUsuario;
        const clienteId = await carritoModel.obtenerClienteIdPorUsuarioId(idUsuario);
        if (!clienteId) return res.status(400).json({ rpta: false, mensaje: "El usuario no tiene cliente asociado." });

        const codigo = String(req.query?.codigo || "").trim();
        if (!codigo) return res.status(400).json({ rpta: false, mensaje: "Debe enviar el código del pedido." });

        const pool = await getConnection();
        const [ventaRows] = await pool.query(
            `SELECT
                v.IDVENTA AS idVenta,
                v.CODIGO AS codigo,
                v.PRECIO_TOTAL AS total,
                v.ESTADO AS estado,
                v.CREATEDAT AS createdAt,
                e.ESTADO AS envioEstado,
                e.DIRECCION AS direccionEnvio,
                pa.ESTADO AS pagoEstado,
                mp.NOMBRE AS metodoPago
             FROM VENTA v
             LEFT JOIN ENVIO e ON e.VENTA_ID = v.IDVENTA
             LEFT JOIN PAGO pa ON pa.VENTA_ID = v.IDVENTA
             LEFT JOIN METODO_PAGO mp ON mp.IDMETODO_PAGO = pa.METODO_PAGO_ID
             WHERE v.CLIENTE_ID = ? AND v.CODIGO = ?
             LIMIT 1`,
            [clienteId, codigo]
        );
        if (!ventaRows.length) return res.status(404).json({ rpta: false, mensaje: "Pedido no encontrado." });

        const venta = ventaRows[0];
        const [detRows] = await pool.query(
            `SELECT
                vd.CANTIDAD AS cantidad,
                vd.PRECIO_UNITARIO AS precioUnitario,
                pv.TALLA AS talla,
                pv.COLOR AS color,
                p.NOMBRE AS productoNombre,
                p.IMAGEN AS imagen
             FROM VENTA_DETALLE vd
             INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = vd.PRODUCTO_VARIANTE_ID
             INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
             WHERE vd.VENTA_ID = ?
             ORDER BY vd.IDVENTA_DETALLE ASC`,
            [venta.idVenta]
        );

        const detalles = detRows.map((d) => ({
            productoNombre: d.productoNombre,
            imagen: d.imagen,
            talla: d.talla,
            color: d.color,
            cantidad: Number(d.cantidad || 0),
            precioUnitario: d.precioUnitario == null ? null : Number(d.precioUnitario)
        }));

        return res.json({
            rpta: true,
            pedido: {
                ...venta,
                totalItems: detalles.reduce((acc, it) => acc + Number(it.cantidad || 0), 0),
                detalles
            }
        });
    } catch (error) {
        return res.status(500).json({ rpta: false, mensaje: error.message || "Error al consultar pedido." });
    }
};

const estadoVentaLabel = (estado) => {
    switch (Number(estado)) {
        case checkoutModel.VentaEstado.PENDIENTE_PAGO:
            return "PENDIENTE_PAGO";
        case checkoutModel.VentaEstado.PAGADO:
            return "PAGADO";
        case checkoutModel.VentaEstado.ENVIADO:
            return "ENVIADO";
        case checkoutModel.VentaEstado.EN_CAMINO:
            return "EN_CAMINO";
        case checkoutModel.VentaEstado.FINALIZADO:
            return "FINALIZADO";
        case checkoutModel.VentaEstado.CANCELADO:
            return "CANCELADO";
        default:
            return "DESCONOCIDO";
    }
};

const actualizarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body || {};
        const idVenta = Number(id);
        const estadoNum = Number(estado);
        if (!isFinite(idVenta) || !isFinite(estadoNum)) return res.status(400).json({ rpta: false, mensaje: "Datos inválidos." });

        const allowed = new Set([
            checkoutModel.VentaEstado.ENVIADO,
            checkoutModel.VentaEstado.EN_CAMINO,
            checkoutModel.VentaEstado.FINALIZADO
        ]);
        if (!allowed.has(estadoNum)) return res.status(400).json({ rpta: false, mensaje: "Estado no permitido." });

        const pool = await getConnection();
        const [ventaActualRows] = await pool.query("SELECT ESTADO, CLIENTE_ID, CODIGO FROM VENTA WHERE IDVENTA = ? LIMIT 1", [idVenta]);
        if (!ventaActualRows.length) return res.status(404).json({ rpta: false, mensaje: "Venta no encontrada." });
        const estadoActual = Number(ventaActualRows[0].ESTADO);

        const bloqueados = new Set([
            checkoutModel.VentaEstado.PENDIENTE_PAGO,
            checkoutModel.VentaEstado.CANCELADO,
            checkoutModel.VentaEstado.FINALIZADO
        ]);
        if (bloqueados.has(estadoActual)) {
            return res.status(400).json({ rpta: false, mensaje: "No se puede actualizar el estado en la situación actual." });
        }

        const transiciones = new Map();
        transiciones.set(checkoutModel.VentaEstado.PAGADO, new Set([checkoutModel.VentaEstado.ENVIADO]));
        transiciones.set(
            checkoutModel.VentaEstado.ENVIADO,
            new Set([checkoutModel.VentaEstado.EN_CAMINO, checkoutModel.VentaEstado.FINALIZADO])
        );
        transiciones.set(checkoutModel.VentaEstado.EN_CAMINO, new Set([checkoutModel.VentaEstado.FINALIZADO]));

        const permitidosDesdeActual = transiciones.get(estadoActual) || new Set();
        if (!permitidosDesdeActual.has(estadoNum)) {
            return res.status(400).json({
                rpta: false,
                mensaje: `Transición inválida: ${estadoVentaLabel(estadoActual)} → ${estadoVentaLabel(estadoNum)}`
            });
        }

        await ventaModel.actualizarEstadoVenta(idVenta, estadoNum);
        await ventaModel.actualizarEstadoPedidoPorVenta(idVenta, estadoNum);

        if (estadoNum === checkoutModel.VentaEstado.ENVIADO) {
            await ventaModel.actualizarEnvioPorVenta(idVenta, checkoutModel.EnvioEstado.ENVIADO, new Date());
        } else if (estadoNum === checkoutModel.VentaEstado.EN_CAMINO) {
            await ventaModel.actualizarEnvioPorVenta(idVenta, checkoutModel.EnvioEstado.EN_CAMINO, null);
        } else if (estadoNum === checkoutModel.VentaEstado.FINALIZADO) {
            await ventaModel.actualizarEnvioPorVenta(idVenta, checkoutModel.EnvioEstado.ENTREGADO, null);
        }

        if (ventaActualRows.length) {
            const mensaje = `Tu pedido ${ventaActualRows[0].CODIGO} cambió de estado a ${estadoVentaLabel(estadoNum)}.`;
            await pool.query(
                "INSERT INTO NOTIFICACION (CLIENTE_ID, MENSAJE, TIPO, LEIDO, CREATEDAT) VALUES (?, ?, ?, ?, ?)",
                [ventaActualRows[0].CLIENTE_ID, mensaje, "PEDIDO", 0, new Date()]
            );
        }

        res.json({ rpta: true, mensaje: "Estado actualizado." });
    } catch (error) {
        res.status(500).send(error.message);
    }
};

export const methods = {
    listarMisVentas,
    listarVentasAdmin,
    consultarPedidoPorCodigo,
    actualizarEstado
};
