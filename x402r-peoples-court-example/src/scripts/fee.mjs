// Separate testnet USDC filing payment, using the guide's legacy txHash seam.
// Never takes the fee from the disputed corpus or grants escrow authority.
import assert from 'node:assert/strict';
import { erc20Abi, parseUnits } from 'viem';
import { clients, readState, saveState, api, chainConfig, confirmed } from '../lib/shared.mjs';
import { webhookHeaders } from '../lib/webhook.mjs';
const c = await clients('payer');
const handle = await readState('case');
const fee = handle.feeChallenge;
assert(fee && fee.chain === 'base-sepolia' && fee.asset === 'USDC', 'Only a separate Base Sepolia USDC fee is supported.');
assert.equal(fee.confirmEndpoint, '/api/x402r/fee/confirm');
const amount = parseUnits(String(fee.amountUsd), 6);
assert(amount > 0n && amount <= 100_000_000n, 'Unexpected fee. This example caps a filing fee at 100 test USDC.');
console.log(`Separate filing fee: ${fee.amountUsd} USDC to ${fee.payTo}, case ${handle.caseId}`);
if (!handle.feeTx) {
  assert(Date.now() < Date.parse(fee.deadlineAt), 'Fee challenge expired.');
  assert(process.argv.includes('--pay'), 'Review the fee, then pass --pay.');
  const balance = await c.publicClient.readContract({ address: chainConfig.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [c.account.address] });
  assert(balance >= amount, 'Insufficient separate USDC for the filing fee.');
  handle.feeTx = await c.walletClient.writeContract({ address: chainConfig.usdc, abi: erc20Abi, functionName: 'transfer', args: [fee.payTo, amount] });
  await saveState('case', handle);
}
await confirmed(c.publicClient, handle.feeTx);
const pathname = '/api/x402r/fee/confirm';
const body = JSON.stringify({ caseId: handle.caseId, feeRecordId: fee.feeRecordId, txHash: handle.feeTx });
const result = await api(pathname, { method: 'POST', body,
  headers: webhookHeaders({ pathname, body, deliveryId: `fee-${handle.feeTx}` }) });
await saveState('case', { ...handle, ...result, inviteToken: result.respondentInvite?.inviteToken || handle.inviteToken,
  claimantToken: result.claimantToken || handle.claimantToken });
console.log(`Fee confirmed for ${handle.caseId}; docket credentials saved privately. The exact messageToSign must arrive at POST /notice or be relayed by the app operator before npm run answer.`);
