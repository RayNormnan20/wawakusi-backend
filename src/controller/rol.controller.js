import { methods as rolModel } from "./../model/rolModel";

const getRoles = async (req, res) => {
    try {
        const rows = await rolModel.listarRoles();
        res.json(rows);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

export const methods = {
    getRoles
};

