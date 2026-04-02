import { createX402r } from "@x402r/sdk";
import { toClientEvmSigner } from "@x402/evm";
import { CommerceEvmScheme } from "@x402r/evm/commerce/client";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { formatUnits } from "viem";
import { CHAIN_ID } from "../config.js";
import { createClients, loadContext, x402rConfig } from "./shared.js";

// ---------------------------------------------------------------------------
// Test: Escrow period expiry → anyone can call refundInEscrow
//
// 1. Make a paid request through the merchant (creates an authorized payment)
// 2. Wait for the 2-min escrow period to expire
// 3. Call refundInEscrow as a keeper (not the arbiter)
// 4. Verify the refund succeeds
//
// Prerequisites: facilitator + merchant running (NOT arbiter — we want the
// payment to sit in escrow without being released or refunded by the arbiter)
// ---------------------------------------------------------------------------

const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:4021";

async function main() {
  const clients = createClients();
  const ctx = loadContext();
  const sdk = createX402r(x402rConfig(ctx, clients));

  console.log(`Wallet: ${clients.account.address}`);
  console.log(`Operator: ${ctx.operatorAddress}`);

  // Resolve PaymentIndexRecorder address
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

  const recorderAddress = ctx.authorizeRecorderAddress;
  const pirAddress = await publicClient.readContract({
    address: recorderAddress as `0x${string}`,
    abi: [{ name: "recorders", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "address" }] }],
    functionName: "recorders",
    args: [1n],
  });

  const PI_COMPONENTS = [
    { name: "operator", type: "address" },
    { name: "payer", type: "address" },
    { name: "receiver", type: "address" },
    { name: "token", type: "address" },
    { name: "maxAmount", type: "uint120" },
    { name: "preApprovalExpiry", type: "uint48" },
    { name: "authorizationExpiry", type: "uint48" },
    { name: "refundExpiry", type: "uint48" },
    { name: "minFeeBps", type: "uint16" },
    { name: "maxFeeBps", type: "uint16" },
    { name: "feeReceiver", type: "address" },
    { name: "salt", type: "uint256" },
  ] as const;

  const PIR_ABI = [
    {
      name: "payerPaymentCount", type: "function", stateMutability: "view",
      inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "getPayerPayment", type: "function", stateMutability: "view",
      inputs: [{ name: "payer", type: "address" }, { name: "index", type: "uint256" }],
      outputs: [{ name: "", type: "tuple", components: PI_COMPONENTS }],
    },
  ] as const;

  // Get payment count BEFORE making the new payment
  const countBefore = await publicClient.readContract({
    address: pirAddress, abi: PIR_ABI, functionName: "payerPaymentCount",
    args: [clients.account.address],
  }) as bigint;
  console.log(`Payments before: ${countBefore}`);

  // Step 1: Make a paid request to create an authorized payment
  console.log("\n--- Step 1: Make paid request ---");
  const clientSigner = toClientEvmSigner(clients.account);
  const client = new x402Client();
  client.register(`eip155:${CHAIN_ID}`, new CommerceEvmScheme(clientSigner));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const res = await fetchWithPayment(`${MERCHANT_URL}/weather`);
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error("Payment failed — is facilitator + merchant running (without arbiter)?");
    process.exit(1);
  }
  console.log("Body:", await res.json());

  // Wait for block confirmation
  await new Promise((r) => setTimeout(r, 3000));

  // Step 2: Find the new payment
  console.log("\n--- Step 2: Find payment via PaymentIndexRecorder ---");
  console.log(`PaymentIndexRecorder: ${pirAddress}`);

  const countAfter = await publicClient.readContract({
    address: pirAddress, abi: PIR_ABI, functionName: "payerPaymentCount",
    args: [clients.account.address],
  }) as bigint;
  console.log(`Payments after: ${countAfter}`);

  if (countAfter <= countBefore) {
    console.error("No new payment indexed");
    process.exit(1);
  }

  const latestIndex = countAfter - 1n;
  const pi = await publicClient.readContract({
    address: pirAddress, abi: PIR_ABI, functionName: "getPayerPayment",
    args: [clients.account.address, latestIndex],
  });
  const paymentInfo = {
    operator: pi.operator,
    payer: pi.payer,
    receiver: pi.receiver,
    token: pi.token,
    maxAmount: pi.maxAmount,
    preApprovalExpiry: pi.preApprovalExpiry,
    authorizationExpiry: pi.authorizationExpiry,
    refundExpiry: pi.refundExpiry,
    minFeeBps: pi.minFeeBps,
    maxFeeBps: pi.maxFeeBps,
    feeReceiver: pi.feeReceiver,
    salt: pi.salt,
  };
  console.log("PaymentInfo:", {
    ...paymentInfo,
    maxAmount: paymentInfo.maxAmount.toString(),
    salt: paymentInfo.salt.toString(),
  });

  // Check payment state — returns [hasCollected, capturableAmount, ...]
  const state = await sdk.payment.getState(paymentInfo) as any;
  const capturable = Array.isArray(state) ? state[1] : state.capturableAmount ?? 0n;
  console.log(`State: hasCollected=${Array.isArray(state) ? state[0] : state.hasCollected}, capturable=${formatUnits(capturable, 6)} USDC`);

  if (capturable === 0n) {
    console.log("Payment already released/refunded — nothing to test");
    process.exit(0);
  }

  // Step 3: Check escrow period
  console.log("\n--- Step 3: Wait for escrow period ---");
  const duration = await sdk.escrow.getDuration();
  console.log(`Escrow period: ${duration}s`);

  const isInEscrow = await sdk.escrow.isDuringEscrow(paymentInfo);
  if (isInEscrow) {
    const authTime = await sdk.escrow.getAuthorizationTime(paymentInfo);
    const expiresAt = Number(authTime) + Number(duration);
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - now;
    console.log(`Escrow expires in ${remaining}s (at ${new Date(expiresAt * 1000).toISOString()})`);

    if (remaining > 0) {
      console.log(`Waiting ${remaining + 5}s for escrow to expire...`);
      await new Promise((r) => setTimeout(r, (remaining + 5) * 1000));
    }
  } else {
    console.log("Escrow period already expired");
  }

  // Step 4: Call refundInEscrow as a keeper
  console.log("\n--- Step 4: Refund after escrow expiry ---");
  const isStillInEscrow = await sdk.escrow.isDuringEscrow(paymentInfo);
  console.log(`Still in escrow: ${isStillInEscrow}`);

  try {
    const refundHash = await sdk.payment.refundInEscrow(paymentInfo, paymentInfo.maxAmount);
    console.log(`Refund tx: ${refundHash}`);

    // Wait for receipt
    const { createPublicClient: createPC2, http: http2 } = await import("viem");
    const { baseSepolia: bs2 } = await import("viem/chains");
    const pc2 = createPC2({ chain: bs2, transport: http2() });
    const receipt = await pc2.waitForTransactionReceipt({ hash: refundHash });
    console.log(`Receipt: status=${receipt.status}, block=${receipt.blockNumber}`);
    // Wait for RPC to index the new block
    await new Promise((r) => setTimeout(r, 2000));

    // Step 5: Verify state
    console.log("\n--- Step 5: Verify ---");
    const finalState = await sdk.payment.getState(paymentInfo) as any;
    const finalCapturable = BigInt(Array.isArray(finalState) ? finalState[1] : finalState.capturableAmount ?? 0);
    console.log(`Final state: capturable=${formatUnits(finalCapturable, 6)} USDC`);
    console.log(finalCapturable === 0n ? "PASS: Refund successful — escrow empty" : "FAIL: Funds still in escrow");
  } catch (err: any) {
    console.error("Refund failed:", err.shortMessage ?? err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
