// usuarioModel.js

import mysql from "mysql2/promise";
import config from "./../config";

const createUsuarioTableAndData = async () => {
    try {
        const dbConnection = await mysql.createConnection({
            host: config.host,
            database: config.database,
            user: config.user,
            password: config.password
        });

        const [rows, fields] = await dbConnection.execute(`SHOW TABLES LIKE 'Usuario'`);

        if (rows.length === 0) {
            await dbConnection.execute(`
            CREATE TABLE Usuario (
                id              INT             AUTO_INCREMENT  PRIMARY KEY,
                dni             VARCHAR(8)      NOT NULL,
                apellidoPaterno VARCHAR(100)    NOT NULL,
                apellidoMaterno VARCHAR(100)    NOT NULL,
                nombres         VARCHAR(100)    NOT NULL,
                celular         VARCHAR(9)      NOT NULL,
                sexo            VARCHAR(100)    NOT NULL,
                correo          VARCHAR(100)    NOT NULL,
                contrasena      VARCHAR(100)    NOT NULL,
                terminos        BOOLEAN         NOT NULL DEFAULT 0
            );
            `);
            console.log(`Tabla 'Usuario' creada exitosamente.`);
            
            await dbConnection.execute(`
            INSERT INTO Usuario (dni, apellidoPaterno, apellidoMaterno, nombres, celular, sexo, correo, contrasena, terminos) VALUES
            ('12345678', 'Fuentes', 'Regal', 'Diego', '123456789', 'Masculino', 'diego@wawakusi.com', '123', 1),
            ('23456789', 'Ramos', 'Massiel', 'Farah', '987654321', 'Femenino', 'farah@wawakusi.com', '1234', 1),
            ('34567890', 'Vasques', 'Lopez', 'Walter', '123123123', 'Masculino', 'walter@wawakusi.com', '12345', 1),
            ('45678901', 'Cardenas', 'Moreno', 'Alvaro', '951753456', 'Masculino', 'alvaro@wawakusi.com', '123456', 1);
            `);
            console.log(`Datos insertados en la tabla 'Usuario'.`);
        } else {
            console.log(`La tabla 'Usuario' ya existe.`);
        }

        await dbConnection.end();
    } catch (error) {
        console.error('Error al crear o verificar la tabla Usuario:', error.message);
        throw error;
    }
};

export default createUsuarioTableAndData;