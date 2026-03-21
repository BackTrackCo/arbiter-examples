import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "@x402r/sdk";
import { deployDeliveryProtectionOperator } from "@x402r/core/deploy";
import { PRIVATE_KEY, CHAIN_ID, CHAIN } from "../config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http();
const publicClient = createPublicClient({ chain: CHAIN, transport });
const walletClient = createWalletClient({ account, chain: CHAIN, transport });

const config = getChainConfig(CHAIN_ID);
const escrowPeriodSeconds = BigInt(process.env.ESCROW_PERIOD_SECONDS ?? 86400);

console.log(`Deploying delivery protection operator...`);
console.log(`  Arbiter: ${account.address}`);
console.log(`  Chain: ${config.name} (${CHAIN_ID})`);
console.log(`  Escrow period: ${escrowPeriodSeconds}s`);

const result = await deployDeliveryProtectionOperator(walletClient, publicClient, {
  chainId: CHAIN_ID,
  arbiter: account.address,
  feeRecipient: account.address,
  escrowPeriodSeconds,
});

console.log(`  EscrowPeriod: ${result.escrowPeriodAddress}`);
console.log(`  StaticAddressCondition(arbiter): ${result.arbiterConditionAddress}`);
console.log(`  PaymentOperator: ${result.operatorAddress}`);
console.log(`  New: ${result.summary.newCount}, Existing: ${result.summary.existingCount}`);
console.log(`\nAdd to .env:\n  OPERATOR_ADDRESS=${result.operatorAddress}`);
