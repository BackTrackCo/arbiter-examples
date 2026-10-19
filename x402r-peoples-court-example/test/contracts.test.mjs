import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData } from 'viem';
import { computeEscrowNonce } from '@x402r/core';
import { buildPayload, paymentInfoFor } from '../src/lib/payload.mjs';
import { guardEnvironment, CHAIN_ID, HOLD_SECONDS, chainConfig, terms } from '../src/lib/shared.mjs';
import { webhookHeaders } from '../src/lib/webhook.mjs';

// Independent sources: the integration guide's payment-time consent contract,
// the SDK's ERC-3009 types, and the user's explicit Base Sepolia/port boundary.
const operator = '0x1111111111111111111111111111111111111111';
// ERC-3009 ReceiveWithAuthorization typed data (EIP-3009 specification).
const RECEIVE_AUTHORIZATION_TYPES = { ReceiveWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] };
function offer() {
  const now = Math.floor(Date.now() / 1000);
  return { scheme: 'auth-capture', network: `eip155:${CHAIN_ID}`, asset: chainConfig.usdc,
    amount: '10000', payTo: '0x2222222222222222222222222222222222222222', maxTimeoutSeconds: 3600,
    extra: { captureAuthorizer: operator, feeRecipient: operator, autoCapture: false, assetTransferMethod: 'eip3009',
      captureDeadline: now + HOLD_SECONDS + 86400, refundDeadline: now + HOLD_SECONDS + 86400,
      minFeeBps: 0, maxFeeBps: 100, name: 'USDC', version: '2' } };
}
test('terms hash binds both PaymentInfo and the payer ERC-3009 signature', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const { paymentInfo: pi, payload } = await buildPayload(offer(), account, terms.termsHash);
  assert.equal(pi.salt, BigInt(`0x${terms.termsHash}`));
  const a = payload.payload.authorization;
  const message = { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) };
  const signatureInput = { address: account.address, domain: { name: 'USDC', version: '2', chainId: CHAIN_ID, verifyingContract: pi.token },
    types: RECEIVE_AUTHORIZATION_TYPES, primaryType: 'ReceiveWithAuthorization', message, signature: payload.payload.signature };
  assert(await verifyTypedData(signatureInput));
  const substitutedNonce = computeEscrowNonce(CHAIN_ID, chainConfig.authCaptureEscrow, { ...pi, salt: pi.salt + 1n });
  assert.notEqual(substitutedNonce, a.nonce);
  assert.equal(await verifyTypedData({ ...signatureInput, message: { ...message, nonce: substitutedNonce } }), false);
});
test('rejects wrong chain, immediate capture, excessive fees and short holds before signing', () => {
  for (const mutate of [r => r.network = 'eip155:8453', r => r.extra.autoCapture = true,
    r => r.extra.captureDeadline = Math.floor(Date.now() / 1000) + 86400,
    r => r.extra.refundDeadline = r.extra.captureDeadline - 1, r => r.extra.maxFeeBps = 500]) {
    const r = offer(); mutate(r);
    assert.throws(() => paymentInfoFor(r, operator, terms.termsHash));
  }
});
test('Base mainnet and port 3000 are denied by configuration', () => {
  assert.throws(() => guardEnvironment({ X402R_CHAIN: 'base' }));
  assert.throws(() => guardEnvironment({ MERCHANT_PORT: '3000' }));
  assert.throws(() => guardEnvironment({ ARBITRATOR_API_URL: 'http://localhost:3000' }));
});
test('HMAC signs the exact bytes, path, method, timestamp and delivery id', () => {
  // Independent external contract: docs/x402r-integration-guide.md, Option A.
  const body = '{"amount":0.01}';
  const deliveryId = '0123456789abcdef';
  const secret = randomBytes(32).toString('hex');
  const expected = createHmac('sha256', secret).update([
    'v1', '1800000000', deliveryId, 'POST', '/api/x402r/referral', createHash('sha256').update(body).digest('hex'),
  ].join('\n')).digest('hex');
  const headers = webhookHeaders({ body, deliveryId, secret, pathname: '/api/x402r/referral', timestamp: 1800000000 });
  assert.equal(headers['x-x402r-signature'], `v1=${expected}`);
  assert.notEqual(webhookHeaders({ body: `${body}\n`, deliveryId, secret, pathname: '/api/x402r/referral', timestamp: 1800000000 })['x-x402r-signature'], headers['x-x402r-signature']);
});
