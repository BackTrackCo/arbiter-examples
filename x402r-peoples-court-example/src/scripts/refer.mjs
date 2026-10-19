import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clients, context, payment, readState, maybeState, saveState, api, sdkFor, json } from '../lib/shared.mjs';
import { webhookHeaders } from '../lib/webhook.mjs';
const c = await clients();
const ctx = await context();
const { saved, pi } = await payment();
assert(saved.refundRequestTx && saved.evidenceTx, 'File the on-chain request and evidence first.');
let referral = await maybeState('referral');
if (!referral) {
  const sdk = sdkFor(ctx, c);
  assert(await sdk.refund.has(pi), 'RefundRequest not visible on-chain.');
  const [authorizedAt, duration] = await Promise.all([sdk.escrow.getAuthorizationTime(pi), sdk.escrow.getDuration()]);
  assert(authorizedAt > 0n);
  const claim = JSON.parse(await readFile('claim.json', 'utf8'));
  referral = { paymentInfoHash: saved.paymentInfoHash, chain: 'base-sepolia', operator: ctx.operatorAddress,
    arbitrationTerms: ctx.arbitrationTerms, payer: { address: pi.payer }, merchant: { address: pi.receiver,
      ...(process.env.ARBITRATION_NOTICE_ENDPOINT ? { endpoint: process.env.ARBITRATION_NOTICE_ENDPOINT } : {}) },
    amount: Number(pi.maxAmount) / 1e6, currency: 'USDC', reason: claim.reason, deliverable: saved.deliverable,
    paymentAuthorizationTx: saved.authorizationTx, refundRequestTx: saved.refundRequestTx,
    paymentInfo: JSON.parse(json(pi)), paymentAuthorizedAt: new Date(Number(authorizedAt) * 1000).toISOString(),
    escrowWindowEndsAt: new Date(Number(authorizedAt + duration) * 1000).toISOString(), claimClass: 'escrowed_refund_request' };
  await saveState('referral', referral);
}
// Preserve exact bytes and delivery ID on retries. The case handle contains
// capability tokens and is saved privately, never printed or committed.
const body = JSON.stringify(referral);
const result = await api('/api/x402r/referral', { method: 'POST', body, acceptFeeChallenge: true,
  headers: webhookHeaders({ pathname: '/api/x402r/referral', body, deliveryId: saved.paymentInfoHash }) });
const old = await maybeState('case');
await saveState('case', { ...old, ...result,
  claimantToken: result.claimantToken || old?.claimantToken,
  inviteToken: result.inviteToken || old?.inviteToken,
  messageToSign: result.messageToSign || old?.messageToSign });
console.log(`caseId=${result.caseId ?? old?.caseId} status=${result.status ?? 'docketed'}; private credentials saved to .state/case.json`);
for (const name of ['escrowWindowWarning', 'paymentDeadlineWarning']) if (result[name]) console.log(`${name}: ${result[name]}`);
if (result.feeChallenge) console.log('Separate filing fee required. Review .state/case.json, then run npm run fee -- --pay. No Answer or clock until docketed.');
