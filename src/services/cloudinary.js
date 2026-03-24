import { v2 as cloudinary } from "cloudinary";
import config from "./../config";
import path from "path";

let enabled = false;
if (config.useCloudinary && config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
    cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret
    });
    enabled = true;
}

const isEnabled = () => enabled;

const uploadLocalImage = async ({ filePath, folder = "wawakusiuploads" }) => {
    if (!enabled || !filePath) return null;
    const res = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: "image",
        overwrite: true
    });
    return { url: res.secure_url, publicId: res.public_id };
};

const uploadBuffer = async ({ buffer, folder = "wawakusiuploads", filename }) => {
    if (!enabled || !buffer) return null;
    return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "image", public_id: filename || undefined, overwrite: true },
            (error, result) => {
                if (error) return reject(error);
                resolve({ url: result.secure_url, publicId: result.public_id });
            }
        );
        stream.end(buffer);
    });
};
const deleteByUrl = async (url) => {
    try {
        if (!enabled || !url) return false;
        const idx = url.indexOf("/upload/");
        if (idx === -1) return false;
        const tail = url.substring(idx + "/upload/".length);
        const publicId = tail.replace(/\.[a-zA-Z0-9]+(\?.*)?$/, "");
        if (!publicId) return false;
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        return true;
    } catch {
        return false;
    }
};

export default {
    isEnabled,
    uploadLocalImage,
    uploadBuffer,
    deleteByUrl
};
