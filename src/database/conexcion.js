// conexcion.js
import mysql from "mysql2/promise";
import config from "./../config";

const pool = mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    database: config.database,
    user: config.user,    
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const getConnection = () => {
    return pool;
};

module.exports = {
    getConnection
};
