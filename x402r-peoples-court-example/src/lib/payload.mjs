// Bind registered arbitration terms before signing the Base Sepolia payment.
import assert from 'node:assert/strict';
import { computeEscrowNonce, computePaymentInfoHash, signReceiveAuthorization } from '@x402r/core';
import { CHAIN_ID, AMOUNT, HOLD_SECONDS, chainConfig } from './shared.mjs';

export function paymentInfoFor(requirements, payer, termsHash, now = Math.floor(Date.now() / 1000)) {
  assert.equal(requirements.scheme, 'auth-capture');
  assert.equal(requirements.network, `eip155:${CHAIN_ID}`);
  assert.equal(requirements.asset.toLowerCase(), chainConfig.usdc.toLowerCase());
  assert.equal(BigInt(requirements.amount), AMOUNT, 'This example only authorizes 0.01 test USDC.');
  assert.match(termsHash, /^[0-9a-f]{64}$/);
  const x = requirements.extra;
  assert.equal(x.autoCapture, false);
  assert.equal(x.assetTransferMethod, 'eip3009');
  assert.equal(x.minFeeBps, 0);
  assert(x.maxFeeBps >= 0 && x.maxFeeBps <= 100, 'Fee authorization exceeds the example cap.');
  assert(requirements.maxTimeoutSeconds > 0 && requirements.maxTimeoutSeconds <= 3600);
  assert.equal(x.feeRecipient.toLowerCase(), x.captureAuthorizer.toLowerCase());
  assert(x.captureDeadline >= now + HOLD_SECONDS && x.refundDeadline >= x.captureDeadline,
    'Capture and refund deadlines must cover the 31-day hold.');
  return { operator: x.captureAuthorizer, payer, receiver: requirements.payTo, token: requirements.asset,
    maxAmount: AMOUNT, preApprovalExpiry: now + requirements.maxTimeoutSeconds,
    authorizationExpiry: x.captureDeadline, refundExpiry: x.refundDeadline,
    minFeeBps: x.minFeeBps, maxFeeBps: x.maxFeeBps, feeReceiver: x.feeRecipient, salt: BigInt(`0x${termsHash}`) };
}
export async function buildPayload(requirements, account, termsHash) {
  const paymentInfo = paymentInfoFor(requirements, account.address, termsHash);
  const signed = await signReceiveAuthorization({ account, chainId: CHAIN_ID, paymentInfo,
    tokenName: requirements.extra.name, tokenVersion: requirements.extra.version, escrowAddress: chainConfig.authCaptureEscrow });
  const payload = { x402Version: 2, accepted: requirements, payload: {
    authorization: { from: account.address, to: signed.tokenCollector, value: AMOUNT.toString(), validAfter: '0',
      validBefore: String(paymentInfo.preApprovalExpiry), nonce: computeEscrowNonce(CHAIN_ID, chainConfig.authCaptureEscrow, paymentInfo) },
    signature: signed.collectorData, salt: `0x${termsHash}` } };
  return { paymentInfo, paymentInfoHash: computePaymentInfoHash(CHAIN_ID, chainConfig.authCaptureEscrow, paymentInfo), payload };
}
