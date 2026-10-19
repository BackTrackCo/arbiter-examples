import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { createX402r, getChainConfig, computePaymentInfoHash } from '@x402r/sdk';
import terms from '../../arbitration-terms.json' with { type: 'json' };

export const CHAIN_ID = 84532;
export const HOLD_SECONDS = 31 * 24 * 60 * 60;
export const AMOUNT = 10_000n;
export const chainConfig = getChainConfig(CHAIN_ID);
export { terms };
export function guardEnvironment(env = process.env) {
  assert.equal(env.X402R_CHAIN ?? 'base-sepolia', 'base-sepolia', 'Only Base Sepolia is permitted.');
  for (const name of ['ARBITRATOR_API_URL', 'MERCHANT_URL']) {
    if (env[name]) assert.notEqual(new URL(env[name]).port, '3000', `${name}: port 3000 is forbidden.`);
  }
  assert.notEqual(env.MERCHANT_PORT, '3000', 'Port 3000 is forbidden.');
}
guardEnvironment();
export function required(name) {
  const value = process.env[name]?.trim();
  assert(value, `${name} is required.`);
  return value;
}
export const apiBase = process.env.ARBITRATOR_API_URL ?? 'http://localhost:3418';
export const merchantUrl = process.env.MERCHANT_URL ?? 'http://localhost:4021';
export function accountFor(role) { return privateKeyToAccount(required(`${role.toUpperCase()}_PRIVATE_KEY`)); }
export async function clients(role) {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(required('X402R_RPC_URL')) });
  assert.equal(await publicClient.getChainId(), CHAIN_ID, 'RPC must report chain 84532 before any signing or transaction.');
  const account = role ? accountFor(role) : undefined;
  const walletClient = account ? createWalletClient({ account, chain: baseSepolia, transport: http(required('X402R_RPC_URL')) }) : undefined;
  return { publicClient, walletClient, account };
}
export const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
export async function readState(name) { return JSON.parse(await readFile(`.state/${name}.json`, 'utf8')); }
export async function maybeState(name) {
  try { return await readState(name); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function saveState(name, value) {
  await mkdir('.state', { recursive: true, mode: 0o700 });
  await writeFile(`.state/${name}.json.tmp`, `${json(value)}\n`, { mode: 0o600 });
  await rename(`.state/${name}.json.tmp`, `.state/${name}.json`);
}
export async function context() {
  const ctx = await readState('context');
  assert.equal(ctx.chainId, CHAIN_ID);
  assert.equal(ctx.arbitrationTerms.termsHash, required('X402R_OPERATOR_TERMS_HASH'));
  assert.equal(json(ctx.arbitrationTerms), json(terms), 'Use the exact registered terms tuple.');
  return ctx;
}
export function sdkFor(ctx, c) {
  return createX402r({ ...c, chainId: CHAIN_ID, operatorAddress: ctx.operatorAddress,
    escrowPeriodAddress: ctx.escrowPeriodAddress, refundRequestAddress: ctx.refundRequestAddress,
    refundRequestEvidenceAddress: ctx.refundRequestEvidenceAddress,
    paymentIndexRecorderHookAddress: ctx.paymentIndexRecorderHookAddress });
}
export async function payment() {
  const saved = await readState('payment');
  const pi = { ...saved.paymentInfo, maxAmount: BigInt(saved.paymentInfo.maxAmount), salt: BigInt(saved.paymentInfo.salt) };
  const ctx = await context();
  assert.equal(pi.operator.toLowerCase(), ctx.operatorAddress.toLowerCase());
  assert.equal(saved.chainId, CHAIN_ID);
  assert.equal(computePaymentInfoHash(CHAIN_ID, chainConfig.authCaptureEscrow, pi), saved.paymentInfoHash);
  return { saved, pi };
}
export async function confirmed(publicClient, hash) {
  console.log(`https://sepolia.basescan.org/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  assert.equal(receipt.status, 'success', `Transaction reverted: ${hash}`);
  return receipt;
}
export async function api(pathname, { method = 'GET', body, headers = {}, acceptFeeChallenge = false } = {}) {
  const response = await fetch(new URL(pathname, apiBase), { method, headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(600_000) });
  const raw = await response.text();
  let result; try { result = JSON.parse(raw); } catch { result = { error: raw }; }
  if ((!response.ok && !(acceptFeeChallenge && response.status === 402 && result.ok)) || result.ok === false) {
    await saveState('last-api-error', { pathname, status: response.status, result });
    const error = new Error(`${method} ${pathname} -> ${response.status}: ${result.error ?? 'See .state/last-api-error.json'}`);
    error.status = response.status;
    throw error;
  }
  return result.data ?? result;
}
