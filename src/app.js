import express from "express";
import morgan from "morgan";
import path from "path";

import loginRouters from "./routers/login.routers";
import usuarioRouters from "./routers/usuario.routers";
import productoRouters from "./routers/producto.routers";
import descuentoRouters from "./routers/descuento.routers";
import rolRouters from "./routers/rol.routers";
import carritoRouters from "./routers/carrito.routers";
import checkoutRouters from "./routers/checkout.routers";
import ventaRouters from "./routers/venta.routers";
import reportesRouters from "./routers/reportes.routers";
import clienteRouters from "./routers/cliente.routers";
import tarjetaRouters from "./routers/tarjeta.routers";
import validarRouters from "./routers/validar.router";

const app = express();

// Middlewares
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde la carpeta 'uploads'
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Routes
app.use("/api/login", loginRouters);
app.use("/api/usuario", usuarioRouters);
app.use("/api/producto", productoRouters);
app.use("/api/descuento", descuentoRouters);
app.use("/api/rol", rolRouters);
app.use("/api/carrito", carritoRouters);
app.use("/api/checkout", checkoutRouters);
app.use("/api/venta", ventaRouters);
app.use("/api/reportes", reportesRouters);
app.use("/api/cliente", clienteRouters);
app.use("/api/tarjeta", tarjetaRouters);
app.use("/api/ccv", validarRouters);

export default app;
