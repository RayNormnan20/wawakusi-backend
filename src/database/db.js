import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import config from "./../config";

const createDatabaseIfNotExists = async () => {
    if (!config.database) {
        throw new Error("DB_DATABASE no está configurado.");
    }
    try {        
        const connection = await mysql.createConnection({
            host: config.dbHost,
            port: config.dbPort,
            user: config.user,
            password: config.password
        });

        const databaseExists = await connection.execute(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, [config.database]);

        if (databaseExists[0].length === 0) {
            await connection.execute(`CREATE DATABASE ${config.database}`);
            console.log(`Base de datos '${config.database}' creada exitosamente.`);
        } else {
            console.log(`La base de datos '${config.database}' ya existe.`);
        }

        await connection.end();
    } catch (error) {
        console.error('Error al crear o verificar la base de datos y la tabla:', error.message);
        throw error;
    }
};

const ensureTable = async (connection, createSql) => {
    try {
        await connection.execute(createSql);
    } catch (error) {
        if (error?.code === "ER_TABLE_EXISTS_ERROR") return;
        throw error;
    }
};

const getColumns = async (connection, tableName) => {
    const [rows] = await connection.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [config.database, tableName]
    );
    return new Set(rows.map((r) => r.COLUMN_NAME));
};

const tableHasAllColumns = async (connection, tableName, requiredColumns) => {
    const cols = await getColumns(connection, tableName);
    return requiredColumns.every((c) => cols.has(c));
};

const seedIfEmpty = async (connection) => {
    const [roles] = await connection.query("SELECT COUNT(*) AS c FROM ROL");
    if (roles[0]?.c === 0) {
        await connection.query("INSERT INTO ROL (NOMBRE) VALUES ('ADMIN'), ('CLIENTE')");
    }

    const [permisos] = await connection.query("SELECT COUNT(*) AS c FROM PERMISO");
    if (permisos[0]?.c === 0) {
        await connection.query(
            `INSERT INTO PERMISO (NOMBRE) VALUES
             ('CREAR_PRODUCTO'),
             ('EDITAR_PRODUCTO'),
             ('ELIMINAR_PRODUCTO'),
             ('VER_PRODUCTO'),
             ('GESTIONAR_PEDIDOS'),
             ('VER_REPORTES'),
             ('COMPRAR'),
             ('VER_CARRITO')`
        );
    }

    const [rolAdmin] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = 'ADMIN' LIMIT 1");
    const [rolCliente] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = 'CLIENTE' LIMIT 1");

    if (rolAdmin.length) {
        const [allPerms] = await connection.query("SELECT IDPERMISO FROM PERMISO");
        for (const p of allPerms) {
            await connection.query(
                `INSERT INTO ROL_PERMISO (ROL_ID, PERMISO_ID)
                 SELECT ?, ?
                 WHERE NOT EXISTS (
                    SELECT 1 FROM ROL_PERMISO WHERE ROL_ID = ? AND PERMISO_ID = ?
                 )`,
                [rolAdmin[0].IDROL, p.IDPERMISO, rolAdmin[0].IDROL, p.IDPERMISO]
            );
        }
    }

    if (rolCliente.length) {
        const [permRows] = await connection.query(
            "SELECT IDPERMISO, NOMBRE FROM PERMISO WHERE NOMBRE IN ('VER_PRODUCTO','COMPRAR','VER_CARRITO')"
        );
        for (const p of permRows) {
            await connection.query(
                `INSERT INTO ROL_PERMISO (ROL_ID, PERMISO_ID)
                 SELECT ?, ?
                 WHERE NOT EXISTS (
                    SELECT 1 FROM ROL_PERMISO WHERE ROL_ID = ? AND PERMISO_ID = ?
                 )`,
                [rolCliente[0].IDROL, p.IDPERMISO, rolCliente[0].IDROL, p.IDPERMISO]
            );
        }
    }
};

const rebuildUsuarioIfLegacy = async (connection) => {
    const required = ["IDUSUARIO", "USUARIO", "PASSWORD", "ROL_ID", "ESTADO", "CREATEDAT", "UPDATEDAT"];
    const [tables] = await connection.query("SHOW TABLES LIKE 'USUARIO'");
    if (!tables.length) return;

    const ok = await tableHasAllColumns(connection, "USUARIO", required);
    if (ok) return;

    const tmp = `USUARIO__TMP_${Date.now()}`;
    await connection.query(
        `CREATE TABLE ${tmp} (
            IDUSUARIO INT AUTO_INCREMENT PRIMARY KEY,
            USUARIO VARCHAR(255) NOT NULL,
            PASSWORD TINYBLOB NOT NULL,
            ROL_ID INT,
            ESTADO TINYINT NOT NULL,
            CREATEDAT DATETIME NOT NULL,
            UPDATEDAT DATETIME NOT NULL,
            FOREIGN KEY (ROL_ID) REFERENCES ROL(IDROL)
        )`
    );

    const [rolCliente] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = 'CLIENTE' LIMIT 1");
    const rolClienteId = rolCliente[0]?.IDROL || null;

    const [legacyRows] = await connection.query("SELECT * FROM USUARIO");
    const now = new Date();

    for (const u of legacyRows) {
        const correo =
            u.correo ??
            u.Correo ??
            u.email ??
            u.Email ??
            u.usuario ??
            u.Usuario ??
            u.USUARIO ??
            u.USUARIO_EMAIL ??
            null;
        const loginUsuario = String(correo || "").trim().toLowerCase();
        if (!loginUsuario) continue;

        const passPlain = u.contrasena ?? u.Contrasena ?? u.pass ?? u.Pass ?? u.password ?? u.Password ?? u.PASSWORD ?? "";
        const passwordHash = await bcrypt.hash(String(passPlain || ""), 10);

        await connection.query(
            `INSERT INTO ${tmp} (USUARIO, PASSWORD, ROL_ID, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [loginUsuario, Buffer.from(passwordHash), rolClienteId, 1, now, now]
        );
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const old = `USUARIO__OLD_${Date.now()}`;
    await connection.query(`RENAME TABLE USUARIO TO ${old}, ${tmp} TO USUARIO`);
    await connection.query(`DROP TABLE ${old}`);
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
};

const rebuildClienteIfLegacy = async (connection) => {
    const required = ["ID", "NOMBRE", "TELEFONO", "EMAIL", "DIRECCION", "ESTADO", "CREATEDAT", "UPDATEDAT", "IDUSUARIO"];
    const [tables] = await connection.query("SHOW TABLES LIKE 'CLIENTE'");
    if (!tables.length) return;

    const ok = await tableHasAllColumns(connection, "CLIENTE", required);
    if (ok) return;

    const tmp = `CLIENTE__TMP_${Date.now()}`;
    await connection.query(
        `CREATE TABLE ${tmp} (
            ID INT AUTO_INCREMENT PRIMARY KEY,
            NOMBRE VARCHAR(255) NOT NULL,
            TELEFONO VARCHAR(50),
            EMAIL VARCHAR(255),
            DIRECCION VARCHAR(255),
            ESTADO TINYINT NOT NULL,
            CREATEDAT DATETIME NOT NULL,
            UPDATEDAT DATETIME NOT NULL,
            IDUSUARIO INT NOT NULL,
            FOREIGN KEY (IDUSUARIO) REFERENCES USUARIO(IDUSUARIO)
        )`
    );

    const [legacyRows] = await connection.query("SELECT * FROM CLIENTE");
    const now = new Date();

    for (const c of legacyRows) {
        const nombre = c.NOMBRE ?? c.Nombre ?? c.nombre ?? "";
        const telefono = c.TELEFONO ?? c.Telefono ?? c.telefono ?? c.Celular ?? c.celular ?? null;
        const email = c.EMAIL ?? c.Email ?? c.Correo ?? c.correo ?? null;
        const direccion = c.DIRECCION ?? c.Direccion ?? c.direccion ?? null;

        const idUsuario = c.IDUSUARIO ?? c.idUsuario ?? null;
        if (!idUsuario) continue;

        await connection.query(
            `INSERT INTO ${tmp} (NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, CREATEDAT, UPDATEDAT, IDUSUARIO)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre || String(email || "").trim().toLowerCase(), telefono, email ? String(email).trim().toLowerCase() : null, direccion, 1, now, now, idUsuario]
        );
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const old = `CLIENTE__OLD_${Date.now()}`;
    await connection.query(`RENAME TABLE CLIENTE TO ${old}, ${tmp} TO CLIENTE`);
    await connection.query(`DROP TABLE ${old}`);
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
};

const seedDemoUsuariosClientesFromModels = async (connection) => {
    const [countUsers] = await connection.query("SELECT COUNT(*) AS c FROM USUARIO");
    if (countUsers[0]?.c > 0) return;

    const [rolCliente] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = 'CLIENTE' LIMIT 1");
    const rolClienteId = rolCliente[0]?.IDROL;
    if (!rolClienteId) return;

    const now = new Date();
    const demo = [
        { nombres: "Diego", apellidos: "Fuentes Regal", celular: "123456789", email: "diego@wawakusi.com", pass: "123" },
        { nombres: "Farah", apellidos: "Ramos Massiel", celular: "987654321", email: "farah@wawakusi.com", pass: "1234" },
        { nombres: "Walter", apellidos: "Vasques Lopez", celular: "123123123", email: "walter@wawakusi.com", pass: "12345" },
        { nombres: "Alvaro", apellidos: "Cardenas Moreno", celular: "951753456", email: "alvaro@wawakusi.com", pass: "123456" }
    ];

    for (const u of demo) {
        const usuario = u.email.trim().toLowerCase();
        const passwordHash = await bcrypt.hash(u.pass, 10);

        const [insertUsuario] = await connection.query(
            `INSERT INTO USUARIO (USUARIO, PASSWORD, ROL_ID, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuario, Buffer.from(passwordHash), rolClienteId, 1, now, now]
        );

        await connection.query(
            `INSERT INTO CLIENTE (NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, CREATEDAT, UPDATEDAT, IDUSUARIO)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [`${u.nombres} ${u.apellidos}`.trim(), u.celular, usuario, null, 1, now, now, insertUsuario.insertId]
        );
    }
};

const seedLegacyProductosAndTarjetaFromModels = async (connection) => {
    await ensureTable(
        connection,
        `CREATE TABLE IF NOT EXISTS Productos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Nombre VARCHAR(100) NOT NULL,
            Precio VARCHAR(100) NOT NULL,
            Cantidad VARCHAR(100) NOT NULL,
            Descripcion TEXT,
            Imagen VARCHAR(255) NOT NULL
        )`
    );

    const [countProductos] = await connection.query("SELECT COUNT(*) AS c FROM Productos");
    if (countProductos[0]?.c === 0) {
        await connection.query(
            `INSERT INTO Productos (Nombre, Precio, Cantidad, Descripcion, Imagen) VALUES
             ('Baby bodysuit', '50.00', '20', 'Sabor frambuesa', ?),
             ('Baby romper', '50.00', '20', 'Sabor neutro', ?),
             ('Boy sweater', '50.00', '20', 'Sabor fresa', ?),
             ('Newborn bootie', '50.00', '20', 'Sabor fresa', ?),
             ('Cotton sweatshirt', '50.00', '20', 'Sabor fresa', ?),
             ('Girl cardigan', '50.00', '20', 'Sabor fresa', ?)`,
            [
                `http://${config.host}:${config.port}/uploads/default1.jpg`,
                `http://${config.host}:${config.port}/uploads/default2.jpg`,
                `http://${config.host}:${config.port}/uploads/default3.jpg`,
                `http://${config.host}:${config.port}/uploads/default4.jpg`,
                `http://${config.host}:${config.port}/uploads/default5.jpg`,
                `http://${config.host}:${config.port}/uploads/default6.jpg`
            ]
        );
    }

    await ensureTable(
        connection,
        `CREATE TABLE IF NOT EXISTS Tarjeta (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            numeroTarjeta VARCHAR(20) NOT NULL,
            fecha VARCHAR(50) NOT NULL,
            anio VARCHAR(50) NOT NULL,
            CCV VARCHAR(5) NOT NULL
        )`
    );

    const [countTarjeta] = await connection.query("SELECT COUNT(*) AS c FROM Tarjeta");
    if (countTarjeta[0]?.c === 0) {
        await connection.query(
            `INSERT INTO Tarjeta (nombre, numeroTarjeta, fecha, anio, CCV) VALUES
             ('Tarjeta Principal', '1234567890123456', '03/24', '2024', '123'),
             ('Tarjeta Secundaria', '9876543210987654', '12/25', '2025', '456')`
        );
    }
};

const seedAdminUserIfMissing = async (connection) => {
    const [rolAdmin] = await connection.query("SELECT IDROL FROM ROL WHERE NOMBRE = 'ADMIN' LIMIT 1");
    const rolAdminId = rolAdmin[0]?.IDROL;
    if (!rolAdminId) return;

    const usuario = "admin@wawakusi.com";
    const [existing] = await connection.query("SELECT IDUSUARIO FROM USUARIO WHERE USUARIO = ? LIMIT 1", [usuario]);

    const now = new Date();
    let idUsuario;

    if (existing.length) {
        idUsuario = existing[0].IDUSUARIO;
    } else {
        const passwordHash = await bcrypt.hash("admin123", 10);

        const [insertUsuario] = await connection.query(
            `INSERT INTO USUARIO (USUARIO, PASSWORD, ROL_ID, ESTADO, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuario, Buffer.from(passwordHash), rolAdminId, 1, now, now]
        );
        idUsuario = insertUsuario.insertId;
    }

    const [clienteExists] = await connection.query("SELECT ID FROM CLIENTE WHERE IDUSUARIO = ? LIMIT 1", [idUsuario]);
    if (!clienteExists.length) {
        await connection.query(
            `INSERT INTO CLIENTE (NOMBRE, TELEFONO, EMAIL, DIRECCION, ESTADO, CREATEDAT, UPDATEDAT, IDUSUARIO)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ["Administrador", null, usuario, null, 1, now, now, idUsuario]
        );
    }
};

const seedNewCatalogFromLegacyProductos = async (connection) => {
    const [countCat] = await connection.query("SELECT COUNT(*) AS c FROM CATEGORIA");
    if (countCat[0]?.c === 0) {
        const now = new Date();
        await connection.query(
            "INSERT INTO CATEGORIA (NOMBRE, ESTADO, CREATEDAT, UPDATEDAT) VALUES (?, ?, ?, ?)",
            ["General", 1, now, now]
        );
    }

    const [countProd] = await connection.query("SELECT COUNT(*) AS c FROM PRODUCTO");
    if (countProd[0]?.c > 0) return;

    const [catRows] = await connection.query("SELECT CODCATEGORIA FROM CATEGORIA ORDER BY CODCATEGORIA ASC LIMIT 1");
    const categoriaId = catRows[0]?.CODCATEGORIA;
    if (!categoriaId) return;

    const [legacyRows] = await connection.query("SELECT Nombre, Precio, Cantidad, Descripcion, Imagen FROM Productos");
    const now = new Date();

    for (const p of legacyRows) {
        const precio = Number(String(p.Precio ?? "0").replace(",", "."));
        const stock = Number(String(p.Cantidad ?? "0").replace(",", "."));
        const [insertProducto] = await connection.query(
            `INSERT INTO PRODUCTO (CATEGORIA_ID, NOMBRE, MARCA, DESCRIPCION, COSTO, PRECIO_MIN, PRECIO_MAX, STOCK, ESTADO, IMAGEN, CREATEDAT, UPDATEDAT)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                categoriaId,
                p.Nombre,
                null,
                p.Descripcion || null,
                0,
                isNaN(precio) ? 0 : precio,
                isNaN(precio) ? 0 : precio,
                isNaN(stock) ? 0 : stock,
                1,
                p.Imagen || null,
                now,
                now
            ]
        );

        await connection.query(
            `INSERT INTO PRODUCTO_VARIANTE (PRODUCTO_ID, TALLA, COLOR, PRECIO, STOCK)
             VALUES (?, ?, ?, ?, ?)`,
            [insertProducto.insertId, null, null, isNaN(precio) ? null : precio, isNaN(stock) ? null : stock]
        );
    }
};


export const initDatabaseSchema = async () => {
    await createDatabaseIfNotExists();

    const connection = await mysql.createConnection({
        host: config.dbHost,
        port: config.dbPort,
        database: config.database,
        user: config.user,
        password: config.password
    });

    try {
        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS ROL (
                IDROL INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(100) NOT NULL
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PERMISO (
                IDPERMISO INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(100) NOT NULL,
                DESCRIPCION VARCHAR(255)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS ROL_PERMISO (
                IDROL_PERMISO INT AUTO_INCREMENT PRIMARY KEY,
                ROL_ID INT NOT NULL,
                PERMISO_ID INT NOT NULL,
                FOREIGN KEY (ROL_ID) REFERENCES ROL(IDROL),
                FOREIGN KEY (PERMISO_ID) REFERENCES PERMISO(IDPERMISO)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS USUARIO (
                IDUSUARIO INT AUTO_INCREMENT PRIMARY KEY,
                USUARIO VARCHAR(255) NOT NULL,
                PASSWORD TINYBLOB NOT NULL,
                ROL_ID INT,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (ROL_ID) REFERENCES ROL(IDROL)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS CLIENTE (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(255) NOT NULL,
                TELEFONO VARCHAR(50),
                EMAIL VARCHAR(255),
                DIRECCION VARCHAR(255),
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                IDUSUARIO INT NOT NULL,
                FOREIGN KEY (IDUSUARIO) REFERENCES USUARIO(IDUSUARIO)
            )`
        );

        await rebuildUsuarioIfLegacy(connection);
        await rebuildClienteIfLegacy(connection);

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS CATEGORIA (
                CODCATEGORIA INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(255) NOT NULL,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PRODUCTO (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CATEGORIA_ID INT NOT NULL,
                NOMBRE VARCHAR(255) NOT NULL,
                MARCA VARCHAR(100),
                DESCRIPCION TEXT,
                COSTO FLOAT NOT NULL,
                PRECIO_MIN DECIMAL(10,2) NOT NULL,
                PRECIO_MAX DECIMAL(10,2),
                STOCK INT NOT NULL,
                ESTADO TINYINT NOT NULL,
                IMAGEN VARCHAR(255),
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CATEGORIA_ID) REFERENCES CATEGORIA(CODCATEGORIA)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PRODUCTO_VARIANTE (
                IDVARIANTE INT AUTO_INCREMENT PRIMARY KEY,
                PRODUCTO_ID INT NOT NULL,
                TALLA VARCHAR(50),
                COLOR VARCHAR(50),
                PRECIO DECIMAL(10,2),
                STOCK INT,
                FOREIGN KEY (PRODUCTO_ID) REFERENCES PRODUCTO(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS CARRITO (
                IDCARRITO INT AUTO_INCREMENT PRIMARY KEY,
                CLIENTE_ID INT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS CARRITO_DETALLE (
                IDCARRITO_DETALLE INT AUTO_INCREMENT PRIMARY KEY,
                CARRITO_ID INT NOT NULL,
                PRODUCTO_VARIANTE_ID INT NOT NULL,
                CANTIDAD INT NOT NULL,
                FOREIGN KEY (CARRITO_ID) REFERENCES CARRITO(IDCARRITO),
                FOREIGN KEY (PRODUCTO_VARIANTE_ID) REFERENCES PRODUCTO_VARIANTE(IDVARIANTE)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS METODO_PAGO (
                IDMETODO_PAGO INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(255) NOT NULL,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PEDIDO (
                IDPEDIDO INT AUTO_INCREMENT PRIMARY KEY,
                CLIENTE_ID INT NOT NULL,
                FECHAENTREGA DATETIME,
                DIRECCION VARCHAR(255) NOT NULL,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PEDIDO_DETALLE (
                IDPEDIDO_DETALLE INT AUTO_INCREMENT PRIMARY KEY,
                PEDIDO_ID INT NOT NULL,
                PRODUCTO_VARIANTE_ID INT NOT NULL,
                CANTIDAD INT NOT NULL,
                PRECIO_UNITARIO DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (PEDIDO_ID) REFERENCES PEDIDO(IDPEDIDO),
                FOREIGN KEY (PRODUCTO_VARIANTE_ID) REFERENCES PRODUCTO_VARIANTE(IDVARIANTE)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS VENTA (
                IDVENTA INT AUTO_INCREMENT PRIMARY KEY,
                CLIENTE_ID INT NOT NULL,
                USUARIO_ID INT NOT NULL,
                PEDIDO_ID INT NOT NULL,
                CODIGO VARCHAR(255) NOT NULL,
                PRECIO_TOTAL DECIMAL(10,2) NOT NULL,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID),
                FOREIGN KEY (PEDIDO_ID) REFERENCES PEDIDO(IDPEDIDO),
                FOREIGN KEY (USUARIO_ID) REFERENCES USUARIO(IDUSUARIO)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS VENTA_DETALLE (
                IDVENTA_DETALLE INT AUTO_INCREMENT PRIMARY KEY,
                VENTA_ID INT NOT NULL,
                PRODUCTO_VARIANTE_ID INT NOT NULL,
                CANTIDAD INT NOT NULL,
                PRECIO_UNITARIO DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (VENTA_ID) REFERENCES VENTA(IDVENTA),
                FOREIGN KEY (PRODUCTO_VARIANTE_ID) REFERENCES PRODUCTO_VARIANTE(IDVARIANTE)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PAGO (
                IDPAGO INT AUTO_INCREMENT PRIMARY KEY,
                VENTA_ID INT NOT NULL,
                METODO_PAGO_ID INT NOT NULL,
                MONTO DECIMAL(10,2) NOT NULL,
                FECHA DATETIME NOT NULL,
                ESTADO TINYINT NOT NULL,
                TRANSACCION_EXTERNA VARCHAR(255),
                FOREIGN KEY (VENTA_ID) REFERENCES VENTA(IDVENTA),
                FOREIGN KEY (METODO_PAGO_ID) REFERENCES METODO_PAGO(IDMETODO_PAGO)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS NOTIFICACION (
                IDNOTIFICACION INT AUTO_INCREMENT PRIMARY KEY,
                CLIENTE_ID INT NOT NULL,
                MENSAJE TEXT NOT NULL,
                TIPO VARCHAR(50),
                LEIDO TINYINT DEFAULT 0,
                CREATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS ENVIO (
                IDENVIO INT AUTO_INCREMENT PRIMARY KEY,
                VENTA_ID INT NOT NULL,
                DIRECCION VARCHAR(255) NOT NULL,
                FECHA_ENVIO DATETIME,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (VENTA_ID) REFERENCES VENTA(IDVENTA)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS RESENA (
                IDRESENA INT AUTO_INCREMENT PRIMARY KEY,
                PRODUCTO_ID INT NOT NULL,
                CLIENTE_ID INT NOT NULL,
                CALIFICACION INT NOT NULL,
                COMENTARIO TEXT,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (PRODUCTO_ID) REFERENCES PRODUCTO(ID),
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS DESCUENTO (
                IDDESCUENTO INT AUTO_INCREMENT PRIMARY KEY,
                NOMBRE VARCHAR(255) NOT NULL,
                DESCRIPCION TEXT,
                PORCENTAJE DECIMAL(5,2) NOT NULL,
                FECHA_INICIO DATETIME NOT NULL,
                FECHA_FIN DATETIME NOT NULL,
                ESTADO TINYINT NOT NULL,
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS PRODUCTO_DESCUENTO (
                IDPRODUCTO_DESCUENTO INT AUTO_INCREMENT PRIMARY KEY,
                PRODUCTO_ID INT NOT NULL,
                DESCUENTO_ID INT NOT NULL,
                FOREIGN KEY (PRODUCTO_ID) REFERENCES PRODUCTO(ID),
                FOREIGN KEY (DESCUENTO_ID) REFERENCES DESCUENTO(IDDESCUENTO)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS WISHLIST (
                IDWISHLIST INT AUTO_INCREMENT PRIMARY KEY,
                CLIENTE_ID INT NOT NULL,
                NOMBRE VARCHAR(255),
                CREATEDAT DATETIME NOT NULL,
                UPDATEDAT DATETIME NOT NULL,
                FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTE(ID)
            )`
        );

        await ensureTable(
            connection,
            `CREATE TABLE IF NOT EXISTS WISHLIST_PRODUCTO (
                IDWISHLIST_PRODUCTO INT AUTO_INCREMENT PRIMARY KEY,
                WISHLIST_ID INT NOT NULL,
                PRODUCTO_VARIANTE_ID INT NOT NULL,
                FOREIGN KEY (WISHLIST_ID) REFERENCES WISHLIST(IDWISHLIST),
                FOREIGN KEY (PRODUCTO_VARIANTE_ID) REFERENCES PRODUCTO_VARIANTE(IDVARIANTE)
            )`
        );

        await seedIfEmpty(connection);
        await seedAdminUserIfMissing(connection);
        await seedDemoUsuariosClientesFromModels(connection);
        await seedLegacyProductosAndTarjetaFromModels(connection);
        await seedNewCatalogFromLegacyProductos(connection);
    } finally {
        await connection.end();
    }
};

export default initDatabaseSchema;

const scriptPath = String(process.argv?.[1] || "").replace(/\\/g, "/").toLowerCase();
if (scriptPath.endsWith("/src/database/db.js")) {
    initDatabaseSchema()
        .then(() => {
            console.log("DATABASE OK");
            process.exit(0);
        })
        .catch((error) => {
            console.error(error?.message || error);
            process.exit(1);
        });
}

