import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { requestRefund, submitEvidence, getEvidenceCount } from '@x402r/core/actions';
import { clients, context, payment, saveState, confirmed, sdkFor } from '../lib/shared.mjs';
const c = await clients('payer');
const ctx = await context();
const { saved, pi } = await payment();
assert.equal(c.account.address.toLowerCase(), pi.payer.toLowerCase(), 'Only the payer can request a refund.');
assert(saved.authorizationTx, 'Complete payment first.');
const sdk = sdkFor(ctx, c);
// Save every broadcast hash before waiting; reruns only reconcile that hash.
if (!saved.refundRequestTx) {
  assert(!(await sdk.refund.has(pi)), 'Request already exists without a saved tx. Recover its receipt before proceeding.');
  const st = await sdk.payment.getState(pi);
  assert.equal(st[1], pi.maxAmount);
  saved.refundRequestTx = await requestRefund(c.walletClient, { contractAddress: ctx.refundRequestAddress, paymentInfo: pi, amount: pi.maxAmount });
  await saveState('payment', saved);
}
await confirmed(c.publicClient, saved.refundRequestTx);
const claim = JSON.parse(await readFile('claim.json', 'utf8'));
assert(typeof claim.reason === 'string' && claim.reason.trim());
const evidence = { reason: claim.reason, deliverable: saved.deliverable, paymentInfoHash: saved.paymentInfoHash,
  authorizationTx: saved.authorizationTx, refundRequestTx: saved.refundRequestTx };
// RefundRequestEvidence stores a URI. A self-contained data URI keeps this
// small test exhibit recoverable without a separate IPFS pinning credential.
const bytes = JSON.stringify(evidence);
const cid = `data:application/json;base64,${Buffer.from(bytes).toString('base64')}`;
if (!saved.evidenceTx) {
  assert.equal(await getEvidenceCount(c.publicClient, { contractAddress: ctx.refundRequestEvidenceAddress, paymentInfo: pi }), 0n,
    'Evidence already exists without a saved hash. Reconcile before resubmitting.');
  saved.evidenceTx = await submitEvidence(c.walletClient, { contractAddress: ctx.refundRequestEvidenceAddress, paymentInfo: pi, cid });
  saved.evidenceSha256 = createHash('sha256').update(bytes).digest('hex');
  await saveState('payment', saved);
}
await confirmed(c.publicClient, saved.evidenceTx);
await saveState('evidence', evidence);
console.log(`Refund requested with evidence sha256=${saved.evidenceSha256}`);
