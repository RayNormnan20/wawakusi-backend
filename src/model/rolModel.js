import { getConnection } from "./../database/conexcion";

const listarRoles = async () => {
    const pool = await getConnection();
    const [rows] = await pool.query(
        `SELECT
            IDROL AS idRol,
            NOMBRE AS nombre
         FROM ROL
         ORDER BY IDROL ASC`
    );
    return rows;
};

export const methods = {
    listarRoles
};

