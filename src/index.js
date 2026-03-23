import app from "./app"
import config from "./config";
import initDatabaseSchema from "./database/db";


const main = async () => {
    const port = config.port;
    const host = config.host;

    await initDatabaseSchema();

    app.listen(port, host, () => {
        console.log(`Servidor en ejecución en http://${host}:${port}/api/usuario`);
        console.log(`Servidor en ejecución en http://${host}:${port}/api/producto`);
        console.log(`Servidor en ejecución en http://${host}:${port}/api/cliente`);
        console.log(`Servidor en ejecución en http://${host}:${port}/api/tarjeta`);
        
    });
};  

main();
