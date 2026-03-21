import { createPublicClient, createWalletClient, http, pad, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, getFactoryAddresses, getConditionSingletons } from "@x402r/core/config";
import { deployEscrowPeriod, deployStaticAddressCondition, deployOperator } from "@x402r/core/deploy";
import type { OperatorConfig } from "@x402r/core/types";
import { PRIVATE_KEY, CHAIN_ID, CHAIN } from "../config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http();
const publicClient = createPublicClient({ chain: CHAIN, transport });
const walletClient = createWalletClient({ account, chain: CHAIN, transport });

const config = getChainConfig(CHAIN_ID);
const factories = getFactoryAddresses(CHAIN_ID);
const singletons = getConditionSingletons(CHAIN_ID);
const escrowPeriodSeconds = BigInt(process.env.ESCROW_PERIOD_SECONDS ?? 86400);

console.log(`Deploying delivery protection operator...`);
console.log(`  Arbiter: ${account.address}`);
console.log(`  Chain: ${config.name} (${CHAIN_ID})`);
console.log(`  Escrow period: ${escrowPeriodSeconds}s`);

const escrowPeriod = await deployEscrowPeriod(walletClient, publicClient, {
  factoryAddress: factories.escrowPeriod,
  escrowPeriod: escrowPeriodSeconds,
  authorizedCodehash: pad("0x00"),
});
console.log(`  EscrowPeriod: ${escrowPeriod.address} (new: ${escrowPeriod.isNew})`);

const arbiterCondition = await deployStaticAddressCondition(walletClient, publicClient, {
  factoryAddress: factories.staticAddressCondition,
  designatedAddress: account.address,
});
console.log(`  StaticAddressCondition(arbiter): ${arbiterCondition.address} (new: ${arbiterCondition.isNew})`);

const operatorConfig: OperatorConfig = {
  feeRecipient: account.address,
  feeCalculator: zeroAddress,
  authorizeCondition: config.usdcTvlLimit,
  authorizeRecorder: escrowPeriod.address,
  chargeCondition: zeroAddress,
  chargeRecorder: zeroAddress,
  releaseCondition: arbiterCondition.address,
  releaseRecorder: zeroAddress,
  refundInEscrowCondition: escrowPeriod.address,
  refundInEscrowRecorder: zeroAddress,
  refundPostEscrowCondition: singletons.receiver,
  refundPostEscrowRecorder: zeroAddress,
};

const operator = await deployOperator(walletClient, publicClient, {
  factoryAddress: factories.paymentOperator,
  config: operatorConfig,
});
console.log(`  PaymentOperator: ${operator.address} (new: ${operator.isNew})`);
console.log(`\nAdd to .env:\n  OPERATOR_ADDRESS=${operator.address}`);
