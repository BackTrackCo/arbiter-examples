import assert from 'node:assert/strict';
import { erc20Abi } from 'viem';
import { deployArbiterSetup, deployDeliveryProtectionOperator, previewArbiterSetup, previewDeliveryProtectionOperator } from '@x402r/core/deploy';
import { getOperatorConfig, getEscrowPeriodDuration } from '@x402r/core/actions';
import { clients, required, saveState, maybeState, terms, CHAIN_ID, HOLD_SECONDS, AMOUNT, chainConfig } from '../lib/shared.mjs';

const c = await clients('merchant');
const arbiter = required('X402R_ARBITER_ADDRESS');
assert.equal(required('X402R_OPERATOR_TERMS_HASH'), terms.termsHash, 'Have the app operator register this exact tuple before paying.');
const payer = (await clients('payer')).account;
assert.notEqual(payer.address, c.account.address, 'Use two distinct wallets.');
assert.notEqual(arbiter.toLowerCase(), payer.address.toLowerCase());
assert.notEqual(arbiter.toLowerCase(), c.account.address.toLowerCase());
const [merchantEth, payerEth, payerUsdc] = await Promise.all([
  c.publicClient.getBalance({ address: c.account.address }), c.publicClient.getBalance({ address: payer.address }),
  c.publicClient.readContract({ address: chainConfig.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [payer.address] })]);
console.log(`merchant=${c.account.address} payer=${payer.address} payerUsdcBaseUnits=${payerUsdc}`);
assert(merchantEth > 0n && payerEth > 0n, 'Both wallets need Base Sepolia ETH.');
assert(payerUsdc >= AMOUNT, 'Payer needs at least 0.01 Base Sepolia USDC, plus any separate filing fee.');
const options = { chainId: CHAIN_ID, arbiter, feeReceiver: c.account.address, escrowPeriodSeconds: BigInt(HOLD_SECONDS), allowArbiterRefund: true };
const [op, arb] = await Promise.all([previewDeliveryProtectionOperator(c.publicClient, options), previewArbiterSetup(c.publicClient, { chainId: CHAIN_ID, arbiter })]);
if (process.env.X402R_OPERATOR_ADDRESS) assert.equal(process.env.X402R_OPERATOR_ADDRESS.toLowerCase(), op.operatorAddress.toLowerCase(), 'Configured operator differs from the verified 31-day preset.');
console.log(`31-day PaymentOperator=${op.operatorAddress} arbiter=${arbiter} termsHash=${terms.termsHash}`);
const names = ['operatorAddress', 'escrowPeriodAddress', 'arbiterConditionAddress', 'captureConditionAddress', 'voidConditionAddress', 'authorizeHookAddress'];
const addresses = [...names.map(n => op[n]), ...Object.values(arb)];
const exists = async () => (await Promise.all(addresses.map(address => c.publicClient.getCode({ address })))).every(code => code && code !== '0x');
const broadcasts = (await maybeState('setup-broadcasts')) ?? [];
// Persist each SDK broadcast even if its immediate bytecode verification
// fails on a lagging RPC. Do not let the alpha SDK retry deployment writes.
const deploymentWallet = { ...c.walletClient,
  async writeContract(args) {
    const hash = await c.walletClient.writeContract(args);
    broadcasts.push(hash);
    await saveState('setup-broadcasts', broadcasts);
    console.log(`https://sepolia.basescan.org/tx/${hash}`);
    return hash;
  },
  async sendTransaction() { throw new Error('SDK saw missing bytecode after a mined batch. Reconcile saved setup broadcasts and rerun read-only setup; automatic individual writes are disabled.'); },
};
let setupTxHashes = broadcasts;
if (!(await exists())) {
  assert(process.argv.includes('--execute'), 'Missing infrastructure. Review addresses, then run npm run setup -- --execute to deploy on Base Sepolia.');
  // Both factories are permissionless. Merchant deploys the public arbiter-keyed infrastructure.
  for (const deploy of [() => deployArbiterSetup(deploymentWallet, c.publicClient, { chainId: CHAIN_ID, arbiter }),
    () => deployDeliveryProtectionOperator(deploymentWallet, c.publicClient, options)]) {
    const result = await deploy();
    setupTxHashes = [...new Set([...setupTxHashes, ...result.summary.txHashes])];
  }
}
assert(await exists(), 'Deployment incomplete. Re-run setup to reconcile deterministic addresses.');
const config = await getOperatorConfig(c.publicClient, { operatorAddress: op.operatorAddress });
assert.equal(config.captureCondition.toLowerCase(), op.captureConditionAddress.toLowerCase());
assert.equal(config.voidCondition.toLowerCase(), op.voidConditionAddress.toLowerCase());
assert.equal(await getEscrowPeriodDuration(c.publicClient, { escrowPeriodAddress: op.escrowPeriodAddress }), BigInt(HOLD_SECONDS));
await saveState('context', { ...op, ...arb, chainId: CHAIN_ID, arbiter, merchant: c.account.address, payer: payer.address,
  arbitrationTerms: terms, setupTxHashes });
for (const hash of setupTxHashes) console.log(`https://sepolia.basescan.org/tx/${hash}`);
console.log(`Saved .state/context.json. App operator must configure:\nX402R_OPERATOR_ADDRESS=${op.operatorAddress}\nX402R_ESCROW_PERIOD_ADDRESS=${op.escrowPeriodAddress}\nX402R_REFUND_REQUEST_ADDRESS=${arb.refundRequestAddress}\nX402R_PAYMENT_INDEX_RECORDER=${op.paymentIndexRecorderHookAddress}\nX402R_OPERATOR_TERMS_HASH=${terms.termsHash}`);
