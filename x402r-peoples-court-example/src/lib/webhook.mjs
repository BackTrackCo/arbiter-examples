// Authenticate the exact referral bytes for the provisioned operator integration.
import { createHash, createHmac } from 'node:crypto';
import { required } from './shared.mjs';
export function webhookHeaders({ pathname, body, deliveryId, timestamp = Math.floor(Date.now() / 1000), secret = required('X402R_WEBHOOK_SECRET') }) {
  const digest = createHash('sha256').update(body).digest('hex');
  const canonical = ['v1', String(timestamp), deliveryId, 'POST', pathname, digest].join('\n');
  return { 'x-x402r-timestamp': String(timestamp), 'x-x402r-delivery-id': deliveryId,
    'x-x402r-signature': `v1=${createHmac('sha256', secret).update(canonical).digest('hex')}` };
}
