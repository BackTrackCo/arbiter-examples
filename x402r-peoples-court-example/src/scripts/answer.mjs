import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clients, payment, readState, maybeState, saveState, api } from '../lib/shared.mjs';
const { account } = await clients('merchant');
const { pi, saved } = await payment();
assert.equal(account.address.toLowerCase(), pi.receiver.toLowerCase());
const handle = await readState('case');
if (!handle.messageToSign) {
  const notice = await maybeState('notice');
  assert(notice && notice.caseId === handle.caseId && notice.paymentInfoHash === saved.paymentInfoHash &&
    notice.respondentWallet?.toLowerCase() === pi.receiver.toLowerCase(), 'Await the matching service notice from the app; never reconstruct messageToSign.');
  handle.messageToSign = notice.messageToSign;
  handle.inviteToken = notice.inviteToken;
  await saveState('case', handle);
}
assert(handle.caseId && handle.inviteToken && handle.messageToSign, 'A docketed case with the exact served message is required. No reconstruction fallback.');
const answer = JSON.parse(await readFile('answer.json', 'utf8'));
const signature = await account.signMessage({ message: handle.messageToSign });
const result = await api(`/api/disputes/${handle.caseId}/answer`, { method: 'POST', body: {
  inviteToken: handle.inviteToken, walletAddress: account.address, signature,
  name: 'Testnet merchant', type: 'agent', ...answer } });
await saveState('answer', result);
console.log(`Signed merchant Answer accepted for ${handle.caseId}; respondent credential saved privately.`);
