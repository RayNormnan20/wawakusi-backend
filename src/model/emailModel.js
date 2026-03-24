import nodemailer from "nodemailer";

const getTransporter = () => {
    const host = process.env.EMAIL_HOST;
    const port = Number(process.env.EMAIL_PORT || 587);
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
        host,
        port,
        secure: false,
        auth: { user, pass }
    });
};

const enviarCorreo = async ({ to, subject, html, attachments }) => {
    const transporter = getTransporter();
    if (!transporter) return { ok: false, skipped: true };

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        attachments: Array.isArray(attachments) ? attachments : undefined
    });
    return { ok: true };
};

export const methods = {
    enviarCorreo
};

