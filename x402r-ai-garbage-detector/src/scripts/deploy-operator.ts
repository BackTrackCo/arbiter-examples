import { deployDeliveryProtectionOperator } from "@x402r/core/deploy";
import { writeFileSync } from "node:fs";
import { CHAIN_ID, CONTEXT_FILE } from "../config.js";
import { createClients } from "./shared.js";

// ---------------------------------------------------------------------------
// Setup: Deploy delivery protection operator (one-time)
// ---------------------------------------------------------------------------

async function main() {
  const { account, publicClient, walletClient } = createClients();

  console.log(`Wallet: ${account.address}`);
  console.log(`Chain:  Base Sepolia (${CHAIN_ID})`);

  console.log("\nDeploying delivery protection operator...");
  const deployment = await deployDeliveryProtectionOperator(
    walletClient,
    publicClient,
    {
      chainId: CHAIN_ID,
      arbiter: account.address,
      feeReceiver: account.address,
      escrowPeriodSeconds: 120n, // 2 min — LLM evaluation is fast
      // Add SAC(arbiter) to the void OrCondition so the arbiter can refund
      // immediately on FAIL without waiting for the escrow period to expire.
      allowArbiterRefund: true,
    },
  );

  console.log(`  Operator:              ${deployment.operatorAddress}`);
  console.log(`  EscrowPeriod:          ${deployment.escrowPeriodAddress}`);
  console.log(`  ArbiterCondition:      ${deployment.arbiterConditionAddress}`);
  console.log(`  CaptureCondition:      ${deployment.captureConditionAddress}`);
  console.log(`  VoidCondition:         ${deployment.voidConditionAddress}`);
  console.log(`  AuthorizeHook:         ${deployment.authorizeHookAddress}`);
  console.log(`  PaymentIndexRecorder:  ${deployment.paymentIndexRecorderHookAddress}`);
  console.log(`  New: ${deployment.summary.newCount}, existing: ${deployment.summary.existingCount}`);

  const context = {
    operatorAddress: deployment.operatorAddress,
    escrowPeriodAddress: deployment.escrowPeriodAddress,
    arbiterConditionAddress: deployment.arbiterConditionAddress,
    captureConditionAddress: deployment.captureConditionAddress,
    voidConditionAddress: deployment.voidConditionAddress,
    authorizeHookAddress: deployment.authorizeHookAddress,
  };
  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
  console.log(`\nSaved to ${CONTEXT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
