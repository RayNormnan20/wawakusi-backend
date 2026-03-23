import https from "https";

const requestJson = ({ hostname, path, method, headers, body }) => {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname,
                path,
                method,
                headers
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    const statusCode = res.statusCode || 0;
                    const isJson = String(res.headers["content-type"] || "").includes("application/json");
                    let payload = data;
                    if (isJson && data) {
                        try {
                            payload = JSON.parse(data);
                        } catch {
                            payload = data;
                        }
                    }
                    if (statusCode >= 200 && statusCode < 300) return resolve(payload);
                    const err = new Error(
                        typeof payload === "object" && payload && payload.message
                            ? payload.message
                            : `PayPal error ${statusCode}`
                    );
                    err.statusCode = statusCode;
                    err.payload = payload;
                    reject(err);
                });
            }
        );
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
};

const requestForm = ({ hostname, path, method, headers, body }) => {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname,
                path,
                method,
                headers
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    const statusCode = res.statusCode || 0;
                    const isJson = String(res.headers["content-type"] || "").includes("application/json");
                    let payload = data;
                    if (isJson && data) {
                        try {
                            payload = JSON.parse(data);
                        } catch {
                            payload = data;
                        }
                    }
                    if (statusCode >= 200 && statusCode < 300) return resolve(payload);
                    const err = new Error(
                        typeof payload === "object" && payload && payload.error_description
                            ? payload.error_description
                            : `PayPal error ${statusCode}`
                    );
                    err.statusCode = statusCode;
                    err.payload = payload;
                    reject(err);
                });
            }
        );
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
};

const getApiHostname = () => {
    const mode = String(process.env.PAYPAL_MODE || "sandbox").toLowerCase();
    return mode === "live" ? "api-m.paypal.com" : "api-m.sandbox.paypal.com";
};

let cachedToken = null;
let cachedTokenExpiresAtMs = 0;

const getAccessToken = async () => {
    const now = Date.now();
    if (cachedToken && cachedTokenExpiresAtMs - 30_000 > now) return cachedToken;

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        const err = new Error("PayPal no está configurado.");
        err.statusCode = 500;
        throw err;
    }

    const hostname = getApiHostname();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = "grant_type=client_credentials";
    const tokenResp = await requestForm({
        hostname,
        path: "/v1/oauth2/token",
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body)
        },
        body
    });

    cachedToken = tokenResp.access_token;
    const expiresInSec = Number(tokenResp.expires_in || 0);
    cachedTokenExpiresAtMs = now + expiresInSec * 1000;
    return cachedToken;
};

const createOrder = async ({ amount, currencyCode, returnUrl, cancelUrl, referenceId }) => {
    const token = await getAccessToken();
    const hostname = getApiHostname();
    const payload = {
        intent: "CAPTURE",
        purchase_units: [
            {
                reference_id: referenceId || "WAWAKUSI",
                amount: {
                    currency_code: currencyCode || "USD",
                    value: String(Number(amount).toFixed(2))
                }
            }
        ],
        application_context: {
            user_action: "PAY_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl
        }
    };

    return await requestJson({
        hostname,
        path: "/v2/checkout/orders",
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
};

const captureOrder = async (orderId) => {
    const token = await getAccessToken();
    const hostname = getApiHostname();
    return await requestJson({
        hostname,
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({})
    });
};

export const methods = {
    createOrder,
    captureOrder
};

