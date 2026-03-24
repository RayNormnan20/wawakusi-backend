import crypto from "crypto";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import { getConnection } from "./../database/conexcion";
import { methods as carritoModel } from "./carritoModel";
import { methods as paypalModel } from "./paypalModel";
import { methods as emailModel } from "./emailModel";
import config from "./../config";

const VentaEstado = {
    PENDIENTE_PAGO: 0,
    PAGADO: 1,
    ENVIADO: 2,
    EN_CAMINO: 3,
    FINALIZADO: 4,
    CANCELADO: 5
};

const PagoEstado = {
    PENDIENTE: 0,
    PAGADO: 1,
    FALLIDO: 2
};

const EnvioEstado = {
    PENDIENTE: 0,
    ENVIADO: 1,
    EN_CAMINO: 2,
    ENTREGADO: 3
};

const withTransaction = async (fn) => {
    const pool = await getConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (e) {
        try {
            await connection.rollback();
        } catch (_) {}
        throw e;
    } finally {
        try {
            connection.release();
        } catch (_) {}
    }
};

const getClienteByUsuarioId = async (idUsuario) => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        "SELECT ID, NOMBRE, EMAIL, DIRECCION, TELEFONO FROM CLIENTE WHERE IDUSUARIO = ? AND ESTADO = 1 LIMIT 1",
        [idUsuario]
    );
    return rows[0] || null;
};

const ensureMetodoPago = async (connection, nombre) => {
    const [rows] = await connection.query("SELECT IDMETODO_PAGO FROM METODO_PAGO WHERE NOMBRE = ? LIMIT 1", [nombre]);
    if (rows.length) return rows[0].IDMETODO_PAGO;
    const now = new Date();
    const [res] = await connection.query(
        "INSERT INTO METODO_PAGO (NOMBRE, ESTADO, CREATEDAT, UPDATEDAT) VALUES (?, ?, ?, ?)",
        [nombre, 1, now, now]
    );
    return res.insertId;
};

const getPrecioUnitarioFinalVariante = async (connection, productoVarianteId) => {
    const [rows] = await connection.query(
        `SELECT
            COALESCE(pv.PRECIO, p.PRECIO_MIN) AS precioBase,
            dd.descuentoPorcentaje AS descuentoPorcentaje
         FROM PRODUCTO_VARIANTE pv
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         LEFT JOIN (
            SELECT
                pd.PRODUCTO_ID AS productoId,
                MAX(d.PORCENTAJE) AS descuentoPorcentaje
            FROM PRODUCTO_DESCUENTO pd
            INNER JOIN DESCUENTO d ON d.IDDESCUENTO = pd.DESCUENTO_ID
                AND d.ESTADO = 1
                AND NOW() BETWEEN d.FECHA_INICIO AND d.FECHA_FIN
            GROUP BY pd.PRODUCTO_ID
         ) dd ON dd.productoId = p.ID
         WHERE pv.IDVARIANTE = ?
         LIMIT 1`,
        [productoVarianteId]
    );
    if (!rows.length) return null;
    const base = rows[0].precioBase == null ? null : Number(rows[0].precioBase);
    if (base == null || !isFinite(base)) return null;
    const porcentaje = rows[0].descuentoPorcentaje == null ? 0 : Number(rows[0].descuentoPorcentaje);
    const final = base - (base * (isFinite(porcentaje) ? porcentaje : 0)) / 100;
    return Number(final.toFixed(2));
};

const generarCarritoHash = (items) => {
    const normalized = (items || [])
        .map((it) => ({
            productoVarianteId: Number(it.productoVarianteId),
            cantidad: Number(it.cantidad)
        }))
        .filter((it) => isFinite(it.productoVarianteId) && isFinite(it.cantidad) && it.cantidad > 0)
        .sort((a, b) => (a.productoVarianteId !== b.productoVarianteId ? a.productoVarianteId - b.productoVarianteId : a.cantidad - b.cantidad));

    return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};

const crearCheckoutContext = ({ idUsuario, direccionEnvio, carritoHash, currencyCode }) => {
    return jwt.sign(
        {
            direccionEnvio,
            carritoHash,
            currencyCode: currencyCode || "USD"
        },
        config.jwtSecret,
        {
            subject: String(idUsuario),
            expiresIn: "30m"
        }
    );
};

const obtenerSnapshotCarrito = async ({ idUsuario, direccionEnvio, currencyCode }) => {
    const cliente = await getClienteByUsuarioId(idUsuario);
    if (!cliente) {
        const err = new Error("El usuario no tiene cliente asociado.");
        err.statusCode = 400;
        throw err;
    }

    const carrito = await carritoModel.obtenerCarrito(cliente.ID);
    if (!carrito.items.length) {
        const err = new Error("El carrito está vacío.");
        err.statusCode = 400;
        throw err;
    }

    const direccion = String(direccionEnvio || "").trim() || String(cliente.DIRECCION || "").trim();
    if (!direccion) {
        const err = new Error("Debe registrar una dirección de envío.");
        err.statusCode = 400;
        throw err;
    }

    const pool = await getConnection();
    const connection = await pool.getConnection();
    try {
        let total = 0;
        const items = [];
        for (const item of carrito.items) {
            const precioUnitario = await getPrecioUnitarioFinalVariante(connection, item.productoVarianteId);
            if (precioUnitario == null) {
                const err = new Error("No se pudo determinar el precio del producto.");
                err.statusCode = 400;
                throw err;
            }
            const qty = Number(item.cantidad || 0);
            total += Number(precioUnitario) * qty;
            items.push({
                productoVarianteId: Number(item.productoVarianteId),
                cantidad: qty,
                precioUnitario: Number(precioUnitario.toFixed(2))
            });
        }
        return {
            cliente,
            direccion,
            currencyCode: currencyCode || "USD",
            carritoHash: generarCarritoHash(items),
            total: Number(total.toFixed(2)),
            items
        };
    } finally {
        try {
            connection.release();
        } catch (_) {}
    }
};

const crearCheckoutPaypal = async ({ idUsuario, direccionEnvio, currencyCode }) => {
    const snap = await obtenerSnapshotCarrito({ idUsuario, direccionEnvio, currencyCode });
    const ctx = crearCheckoutContext({
        idUsuario,
        direccionEnvio: snap.direccion,
        carritoHash: snap.carritoHash,
        currencyCode: snap.currencyCode
    });

    const baseReturn = process.env.APP_PAYPAL_RETURN_URL || "wawakusi://paypal/success";
    const baseCancel = process.env.APP_PAYPAL_CANCEL_URL || "wawakusi://paypal/cancel";
    const returnUrl = `${baseReturn}?ctx=${encodeURIComponent(ctx)}`;
    const cancelUrl = `${baseCancel}?ctx=${encodeURIComponent(ctx)}`;

    let order;
    try {
        order = await paypalModel.createOrder({
            amount: snap.total,
            currencyCode: snap.currencyCode,
            returnUrl,
            cancelUrl,
            referenceId: `WAWAKUSI-${snap.carritoHash.slice(0, 12)}`
        });
    } catch (e) {
        throw e;
    }

    const approval =
        (order.links || []).find((l) => l.rel === "approve")?.href ||
        (order.links || []).find((l) => l.rel === "payer-action")?.href ||
        null;
    if (!order.id || !approval) {
        const err = new Error("No se pudo crear el pago en PayPal.");
        err.statusCode = 500;
        throw err;
    }

    return { paypalOrderId: order.id, approvalUrl: approval };
};

const descontarStock = async (connection, ventaId) => {
    const [rows] = await connection.query(
        "SELECT PRODUCTO_VARIANTE_ID, CANTIDAD FROM VENTA_DETALLE WHERE VENTA_ID = ?",
        [ventaId]
    );
    for (const r of rows) {
        await connection.query(
            "UPDATE PRODUCTO_VARIANTE SET STOCK = IF(STOCK IS NULL, NULL, GREATEST(STOCK - ?, 0)) WHERE IDVARIANTE = ?",
            [Number(r.CANTIDAD), r.PRODUCTO_VARIANTE_ID]
        );
        await connection.query(
            `UPDATE PRODUCTO p
             INNER JOIN PRODUCTO_VARIANTE pv ON pv.PRODUCTO_ID = p.ID
             SET p.STOCK = IF(p.STOCK IS NULL, NULL, GREATEST(p.STOCK - ?, 0))
             WHERE pv.IDVARIANTE = ?`,
            [Number(r.CANTIDAD), r.PRODUCTO_VARIANTE_ID]
        );
    }
};

const limpiarCarritoCliente = async (connection, clienteId) => {
    const [rows] = await connection.query(
        "SELECT IDCARRITO FROM CARRITO WHERE CLIENTE_ID = ? ORDER BY UPDATEDAT DESC, IDCARRITO DESC LIMIT 1",
        [clienteId]
    );
    if (!rows.length) return;
    await connection.query("DELETE FROM CARRITO_DETALLE WHERE CARRITO_ID = ?", [rows[0].IDCARRITO]);
    await connection.query("UPDATE CARRITO SET UPDATEDAT = ? WHERE IDCARRITO = ?", [new Date(), rows[0].IDCARRITO]);
};

const notificarCliente = async ({ clienteId, mensaje }) => {
    const pool = await getConnection();
    await pool.query(
        "INSERT INTO NOTIFICACION (CLIENTE_ID, MENSAJE, TIPO, LEIDO, CREATEDAT) VALUES (?, ?, ?, ?, ?)",
        [clienteId, mensaje, "PEDIDO", 0, new Date()]
    );
};

const estadoVentaLabel = (estado) => {
    switch (Number(estado)) {
        case VentaEstado.PENDIENTE_PAGO:
            return "PENDIENTE_PAGO";
        case VentaEstado.PAGADO:
            return "PAGADO";
        case VentaEstado.ENVIADO:
            return "ENVIADO";
        case VentaEstado.EN_CAMINO:
            return "EN_CAMINO";
        case VentaEstado.FINALIZADO:
            return "FINALIZADO";
        case VentaEstado.CANCELADO:
            return "CANCELADO";
        default:
            return "DESCONOCIDO";
    }
};

const estadoPagoLabel = (estado) => {
    switch (Number(estado)) {
        case PagoEstado.PENDIENTE:
            return "PENDIENTE";
        case PagoEstado.PAGADO:
            return "PAGADO";
        case PagoEstado.FALLIDO:
            return "FALLIDO";
        default:
            return "DESCONOCIDO";
    }
};

const estadoEnvioLabel = (estado) => {
    switch (Number(estado)) {
        case EnvioEstado.PENDIENTE:
            return "PENDIENTE";
        case EnvioEstado.ENVIADO:
            return "ENVIADO";
        case EnvioEstado.EN_CAMINO:
            return "EN_CAMINO";
        case EnvioEstado.ENTREGADO:
            return "ENTREGADO";
        default:
            return "DESCONOCIDO";
    }
};

const money = (n) => {
    const num = Number(n);
    return isFinite(num) ? `$ ${num.toFixed(2)}` : "$ 0.00";
};

const toPdfBuffer = async (build) => {
    return await new Promise((resolve, reject) => {
        const doc = build();
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
    });
};

const obtenerDatosBoletaVenta = async (ventaId) => {
    const pool = await getConnection();
    const [ventaRows] = await pool.query(
        `SELECT
            v.IDVENTA AS idVenta,
            v.CODIGO AS codigo,
            v.PRECIO_TOTAL AS total,
            v.ESTADO AS estado,
            v.CREATEDAT AS createdAt,
            c.NOMBRE AS clienteNombre,
            c.EMAIL AS clienteEmail,
            c.TELEFONO AS clienteTelefono,
            c.DIRECCION AS clienteDireccion,
            e.DIRECCION AS direccionEnvio,
            e.ESTADO AS envioEstado,
            pa.MONTO AS pagoMonto,
            pa.FECHA AS pagoFecha,
            pa.ESTADO AS pagoEstado,
            pa.TRANSACCION_EXTERNA AS transaccionExterna,
            mp.NOMBRE AS metodoPago
         FROM VENTA v
         INNER JOIN CLIENTE c ON c.ID = v.CLIENTE_ID
         LEFT JOIN ENVIO e ON e.VENTA_ID = v.IDVENTA
         LEFT JOIN PAGO pa ON pa.VENTA_ID = v.IDVENTA
         LEFT JOIN METODO_PAGO mp ON mp.IDMETODO_PAGO = pa.METODO_PAGO_ID
         WHERE v.IDVENTA = ?
         LIMIT 1`,
        [ventaId]
    );
    if (!ventaRows.length) return null;

    const venta = ventaRows[0];
    const [detRows] = await pool.query(
        `SELECT
            vd.CANTIDAD AS cantidad,
            vd.PRECIO_UNITARIO AS precioUnitario,
            pv.TALLA AS talla,
            pv.COLOR AS color,
            p.NOMBRE AS productoNombre
         FROM VENTA_DETALLE vd
         INNER JOIN PRODUCTO_VARIANTE pv ON pv.IDVARIANTE = vd.PRODUCTO_VARIANTE_ID
         INNER JOIN PRODUCTO p ON p.ID = pv.PRODUCTO_ID
         WHERE vd.VENTA_ID = ?
         ORDER BY vd.IDVENTA_DETALLE ASC`,
        [ventaId]
    );

    const detalles = detRows.map((d) => ({
        productoNombre: d.productoNombre,
        talla: d.talla,
        color: d.color,
        cantidad: Number(d.cantidad || 0),
        precioUnitario: d.precioUnitario == null ? null : Number(d.precioUnitario)
    }));

    return { venta, detalles };
};

const generarBoletaPdf = async ({ venta, detalles }) => {
    const createdAt = venta.createdAt ? new Date(venta.createdAt) : null;
    const pagoFecha = venta.pagoFecha ? new Date(venta.pagoFecha) : null;
    const fechaTexto = createdAt && isFinite(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : "-";
    const fechaPagoTexto = pagoFecha && isFinite(pagoFecha.getTime()) ? pagoFecha.toISOString().slice(0, 19).replace("T", " ") : "-";
    const items = Array.isArray(detalles) ? detalles : [];
    const total = Number(venta.total || 0);
    const brand = "#e1664b";
    const light = "#fceedd";
    const border = "#dddddd";
    const label = "#666666";
    const company = process.env.APP_COMPANY_NAME || "WAWAKUSI";
    const companyAddr = process.env.APP_COMPANY_ADDRESS || "";
    const companyEmail = process.env.APP_COMPANY_EMAIL || "";
    const companyPhone = process.env.APP_COMPANY_PHONE || "";
    return await toPdfBuffer(() => {
        const doc = new PDFDocument({ size: "A4", margin: 36 });
        doc.rect(0, 0, doc.page.width, 70).fill(brand);
        doc.fill("#FFFFFF").fontSize(20).text(company, 36, 22);
        doc.fontSize(12).text("Boleta de Pago", { align: "right" });
        doc.moveTo(36, 82).lineWidth(1).strokeColor(border).lineTo(doc.page.width - 36, 82).stroke();
        let y = 92;
        doc.fillColor("#000000").fontSize(11).text(`Código: ${venta.codigo || "-"}`, 36, y);
        doc.text(`Fecha: ${fechaTexto}`, 250, y);
        y += 18;
        doc.text(`Cliente: ${venta.clienteNombre || "-"}`, 36, y);
        doc.text(`Email: ${venta.clienteEmail || "-"}`, 250, y);
        y += 18;
        doc.text(`Teléfono: ${venta.clienteTelefono || "-"}`, 36, y);
        doc.text(`Dirección envío: ${venta.direccionEnvio || venta.clienteDireccion || "-"}`, 250, y, { width: 300 });
        y += 28;
        doc.fillColor(label).text("Resumen de pago", 36, y);
        y += 14;
        doc.fillColor("#000000");
        doc.text(`Estado venta: ${estadoVentaLabel(venta.estado)}`, 36, y);
        doc.text(`Estado pago: ${estadoPagoLabel(venta.pagoEstado)}`, 250, y);
        y += 18;
        doc.text(`Método pago: ${venta.metodoPago || "-"}`, 36, y);
        doc.text(`Fecha pago: ${fechaPagoTexto}`, 250, y);
        y += 18;
        doc.text(`Transacción: ${venta.transaccionExterna || "-"}`, 36, y, { width: 520 });
        y += 24;
        doc.rect(36, y, doc.page.width - 72, 28).fill(light);
        doc.fill("#000000").fontSize(12).text("Detalle de compra", 44, y + 8);
        y += 36;
        const startX = 36;
        const availableW = doc.page.width - 72;
        const colQty = Math.floor(availableW * 0.10);   // ~10%
        const colDesc = Math.floor(availableW * 0.54);  // ~54%
        const colUnit = Math.floor(availableW * 0.18);  // ~18%
        const colSub = availableW - (colQty + colDesc + colUnit); // resto
        const rowH = 18;
        doc.fontSize(10).fillColor(label);
        doc.text("Cant.", startX, y, { width: colQty });
        doc.text("Producto", startX + colQty, y, { width: colDesc });
        doc.text("P.Unit", startX + colQty + colDesc, y, { width: colUnit, align: "right" });
        doc.text("Subtotal", startX + colQty + colDesc + colUnit, y, { width: colSub, align: "right" });
        const headerLineY = y + 12;
        doc.moveTo(startX, headerLineY).lineWidth(0.8).strokeColor(border).lineTo(startX + availableW, headerLineY).stroke();
        y = headerLineY + 8;
        doc.fillColor("#000000");
        let rowAlt = false;
        for (const it of items) {
            const qty = Number(it.cantidad || 0);
            const unit = it.precioUnitario == null ? 0 : Number(it.precioUnitario);
            const subtotal = qty * unit;
            const extra = [it.talla ? `Talla: ${it.talla}` : null, it.color ? `Color: ${it.color}` : null].filter(Boolean).join(" · ");
            const nombre = String(it.productoNombre || "Producto");
            const desc = extra ? `${nombre}  (${extra})` : nombre;
            if (rowAlt) {
                doc.rect(startX, y - 4, availableW, rowH).fillOpacity(0.25).fill(light).fillOpacity(1);
            }
            doc.fillColor("#000000");
            doc.text(String(qty), startX, y, { width: colQty });
            doc.text(desc, startX + colQty, y, { width: colDesc });
            doc.text(money(unit), startX + colQty + colDesc, y, { width: colUnit, align: "right" });
            doc.text(money(subtotal), startX + colQty + colDesc + colUnit, y, { width: colSub, align: "right" });
            y += rowH;
            rowAlt = !rowAlt;
        }
        y += 6;
        doc.moveTo(startX, y).lineWidth(0.8).strokeColor(border).lineTo(startX + availableW, y).stroke();
        y += 10;
        doc.fontSize(12).fillColor("#000000").text(`TOTAL: ${money(total)}`, startX, y, {
            width: colQty + colDesc + colUnit + colSub,
            align: "right"
        });
        y += 40;
        doc.fillColor(label).fontSize(9);
        const companyLine = [companyAddr, companyEmail, companyPhone].filter((v) => String(v || "").trim()).join("  ·  ");
        if (companyLine) doc.text(companyLine, 36, y, { align: "center", width: doc.page.width - 72 });
        y += 14;
        doc.text("Gracias por tu compra.", 36, y, { align: "center", width: doc.page.width - 72 });
        return doc;
    });
};

const capturarPaypalYCrearVenta = async ({ idUsuario, paypalOrderId, checkoutContext }) => {
    const cliente = await getClienteByUsuarioId(idUsuario);
    if (!cliente) {
        const err = new Error("El usuario no tiene cliente asociado.");
        err.statusCode = 400;
        throw err;
    }

    const orderId = String(paypalOrderId || "").trim();
    if (!orderId) {
        const err = new Error("PayPal order id no encontrado.");
        err.statusCode = 400;
        throw err;
    }

    let decoded;
    try {
        decoded = jwt.verify(String(checkoutContext || ""), config.jwtSecret);
    } catch (e) {
        const err = new Error("Contexto de checkout inválido o expirado.");
        err.statusCode = 400;
        throw err;
    }

    const sub = String(decoded?.sub || "");
    if (sub !== String(idUsuario)) {
        const err = new Error("Contexto de checkout no corresponde al usuario.");
        err.statusCode = 403;
        throw err;
    }

    const direccion = String(decoded?.direccionEnvio || "").trim();
    if (!direccion) {
        const err = new Error("Dirección de envío inválida.");
        err.statusCode = 400;
        throw err;
    }

    const snap = await obtenerSnapshotCarrito({ idUsuario, direccionEnvio: direccion, currencyCode: decoded?.currencyCode || "USD" });
    if (String(decoded?.carritoHash || "") !== snap.carritoHash) {
        const err = new Error("El carrito cambió. Vuelve a iniciar el pago.");
        err.statusCode = 400;
        throw err;
    }

    let capture;
    try {
        capture = await paypalModel.captureOrder(orderId);
    } catch (e) {
        if (!e?.statusCode) {
            const err = new Error("No se pudo comunicar con PayPal.");
            err.statusCode = 502;
            throw err;
        }
        throw e;
    }
    const status = String(capture.status || "").toUpperCase();
    if (status !== "COMPLETED") {
        const err = new Error("No se pudo completar el pago.");
        err.statusCode = 400;
        throw err;
    }

    const captureId =
        capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
        capture?.purchase_units?.[0]?.payments?.authorizations?.[0]?.id ||
        orderId;

    const capturedAmount = Number(capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value);
    if (!isFinite(capturedAmount)) {
        const err = new Error("No se pudo validar el monto del pago.");
        err.statusCode = 400;
        throw err;
    }

    const expected = Number(snap.total.toFixed(2));
    if (Number(capturedAmount.toFixed(2)) !== expected) {
        const err = new Error("El monto pagado no coincide con el total del carrito.");
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();
    const codigo = `W-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const result = await withTransaction(async (connection) => {
        const [pedidoRes] = await connection.query(
            `INSERT INTO PEDIDO (CLIENTE_ID, FECHAENTREGA, DIRECCION, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente.ID, null, direccion, VentaEstado.PAGADO, now, now]
        );
        const pedidoId = pedidoRes.insertId;

        for (const item of snap.items) {
            await connection.query(
                `INSERT INTO PEDIDO_DETALLE (PEDIDO_ID, PRODUCTO_VARIANTE_ID, CANTIDAD, PRECIO_UNITARIO)
                 VALUES (?, ?, ?, ?)`,
                [pedidoId, item.productoVarianteId, item.cantidad, Number(Number(item.precioUnitario).toFixed(2))]
            );
        }

        const [ventaRes] = await connection.query(
            `INSERT INTO VENTA (CLIENTE_ID, USUARIO_ID, PEDIDO_ID, CODIGO, PRECIO_TOTAL, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [cliente.ID, idUsuario, pedidoId, codigo, Number(expected.toFixed(2)), VentaEstado.PAGADO, now, now]
        );
        const ventaId = ventaRes.insertId;

        for (const item of snap.items) {
            await connection.query(
                `INSERT INTO VENTA_DETALLE (VENTA_ID, PRODUCTO_VARIANTE_ID, CANTIDAD, PRECIO_UNITARIO)
                 VALUES (?, ?, ?, ?)`,
                [ventaId, item.productoVarianteId, item.cantidad, Number(Number(item.precioUnitario).toFixed(2))]
            );
        }

        const metodoPagoId = await ensureMetodoPago(connection, "PAYPAL");
        await connection.query(
            `INSERT INTO PAGO (VENTA_ID, METODO_PAGO_ID, MONTO, FECHA, ESTADO, TRANSACCION_EXTERNA)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ventaId, metodoPagoId, Number(expected.toFixed(2)), now, PagoEstado.PAGADO, captureId]
        );

        await connection.query(
            `INSERT INTO ENVIO (VENTA_ID, DIRECCION, FECHA_ENVIO, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ventaId, direccion, null, EnvioEstado.PENDIENTE, now, now]
        );

        await descontarStock(connection, ventaId);
        await limpiarCarritoCliente(connection, cliente.ID);

        return { ventaId, codigo };
    });

    const mensaje = `Tu pedido ${result.codigo} fue pagado correctamente.`;
    await notificarCliente({ clienteId: cliente.ID, mensaje });

    if (cliente.EMAIL) {
        const html = `
            <div>
                <h2>Confirmación de pago</h2>
                <p>${mensaje}</p>
                <p>Total: $ ${Number(expected).toFixed(2)}</p>
                <p>Estado: PAGADO</p>
            </div>
        `;
        let attachments;
        try {
            const boleta = await obtenerDatosBoletaVenta(result.ventaId);
            if (boleta) {
                const pdf = await generarBoletaPdf(boleta);
                attachments = [
                    {
                        filename: `Boleta_${result.codigo}.pdf`,
                        content: pdf,
                        contentType: "application/pdf"
                    }
                ];
            }
        } catch (_) {
            attachments = undefined;
        }

        await emailModel.enviarCorreo({
            to: cliente.EMAIL,
            subject: `Pago confirmado · ${result.codigo}`,
            html,
            attachments
        });
    }

    return result;
};

export const methods = {
    VentaEstado,
    PagoEstado,
    EnvioEstado,
    crearCheckoutPaypal,
    capturarPaypalYCrearVenta
};
