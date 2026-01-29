import crypto from 'crypto';

export function validateZoomWebhook(
  requestBody: string,
  timestamp: string,
  signature: string,
  secretToken: string
): boolean {
  try {
    const message = `v0:${timestamp}:${requestBody}`;
    const hashForVerify = crypto
      .createHmac('sha256', secretToken)
      .update(message)
      .digest('hex');
    
    const expectedSignature = `v0=${hashForVerify}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Webhook validation error:', error);
    return false;
  }
}
