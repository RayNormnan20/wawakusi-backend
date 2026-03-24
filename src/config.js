import { config } from "dotenv";

config();

export default{
    host: process.env.HOST || "",
    dbHost: process.env.DB_HOST || process.env.HOST || "",
    dbPort: (() => {
        const n = Number(process.env.DB_PORT);
        return Number.isFinite(n) ? n : undefined;
    })(),
    database: process.env.DB_DATABASE || "",
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",    
    port: process.env.PORT || "",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
    useCloudinary: String(process.env.USE_CLOUDINARY || "").toLowerCase() === "true",
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
        apiKey: process.env.CLOUDINARY_API_KEY || "",
        apiSecret: process.env.CLOUDINARY_API_SECRET || ""
    }
}; 
