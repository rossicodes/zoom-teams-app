"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateZoomWebhook = validateZoomWebhook;
const crypto_1 = __importDefault(require("crypto"));
function validateZoomWebhook(requestBody, timestamp, signature, secretToken) {
    try {
        const message = `v0:${timestamp}:${requestBody}`;
        const hashForVerify = crypto_1.default
            .createHmac('sha256', secretToken)
            .update(message)
            .digest('hex');
        const expectedSignature = `v0=${hashForVerify}`;
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }
    catch (error) {
        console.error('Webhook validation error:', error);
        return false;
    }
}
//# sourceMappingURL=webhookValidator.js.map