import assert from 'node:assert/strict';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { buildPayload } from '../lib/payload.mjs';
import { clients, context, maybeState, saveState, merchantUrl, CHAIN_ID, confirmed, sdkFor } from '../lib/shared.mjs';

const c = await clients('payer');
const ctx = await context();
assert.equal(c.account.address, ctx.payer);
let saved = await maybeState('payment');
if (saved?.authorizationTx) {
  console.log(`Existing payment ${saved.paymentInfoHash}: https://sepolia.basescan.org/tx/${saved.authorizationTx}`);
  process.exit(0);
}
// Persist the signed payload before HTTP transport, so a timeout never creates
// a fresh authorization automatically. Unknown outcomes need reconciliation.
if (!saved) {
  const unpaid = await fetch(`${merchantUrl}/resource`);
  assert.equal(unpaid.status, 402);
  const challenge = decodePaymentRequiredHeader(unpaid.headers.get('payment-required'));
  assert.equal(challenge.accepts.length, 1);
  const requirements = challenge.accepts[0];
  assert.equal(requirements.extra.captureAuthorizer.toLowerCase(), ctx.operatorAddress.toLowerCase());
  assert.equal(requirements.payTo.toLowerCase(), ctx.merchant.toLowerCase());
  assert.deepEqual(requirements.extra.arbitrationTerms, ctx.arbitrationTerms, 'Disclosed terms must match the registered tuple.');
  const built = await buildPayload(requirements, c.account, ctx.arbitrationTerms.termsHash);
  saved = { chainId: CHAIN_ID, ...built };
  await saveState('payment', saved);
}
assert(!saved.attempted, 'Previous HTTP outcome is ambiguous. Inspect merchant state and chain before retrying; do not create another payment.');
saved.attempted = true;
await saveState('payment', saved);
const response = await fetch(`${merchantUrl}/resource`, { headers: { 'payment-signature': encodePaymentSignatureHeader(saved.payload) }, signal: AbortSignal.timeout(120_000) });
const deliverable = await response.text();
assert.equal(response.status, 200, deliverable);
const result = decodePaymentResponseHeader(response.headers.get('payment-response'));
assert(result.success && result.network === `eip155:${CHAIN_ID}`);
saved = { ...saved, authorizationTx: result.transaction, deliverable };
await saveState('payment', saved);
await confirmed(c.publicClient, result.transaction);
const pi = { ...saved.paymentInfo, maxAmount: BigInt(saved.paymentInfo.maxAmount), salt: BigInt(saved.paymentInfo.salt) };
const st = await sdkFor(ctx, c).payment.getState(pi);
assert.equal(st[1], pi.maxAmount, 'Payment must remain open for arbiter capture or void.');
console.log(`paymentInfoHash=${saved.paymentInfoHash}\ndeliverable=${deliverable}\nCapturable=${st[1]} refundable=${st[2]}`);
