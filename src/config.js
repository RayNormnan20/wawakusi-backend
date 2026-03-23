import { config } from "dotenv";

config();

export default{
    host: process.env.HOST || "",
    database: process.env.DB_DATABASE || "",
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",    
    port: process.env.PORT || "",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d"
}; 
