import mysql from "mysql2/promise";
import config from "./../config";

const dropDatabaseIfExists = async () => {
    try {
        const connection = await mysql.createConnection({
            host: config.dbHost,
            port: config.dbPort,
            user: config.user,
            password: config.password
        });

        const [rows, fields] = await connection.execute(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${config.database}'`);

        if (rows.length > 0) {
            await connection.execute(`DROP DATABASE ${config.database}`);
            console.log(`Base de datos '${config.database}' eliminada exitosamente.`);
        } else {
            console.log(`La base de datos '${config.database}' no existe.`);
        }

        await connection.end();
    } catch (error) {
        console.error('Error al eliminar la base de datos:', error.message);
        throw error;
    }
};

export default dropDatabaseIfExists;

// Ejecutar la función para eliminar la base de datos
dropDatabaseIfExists();
