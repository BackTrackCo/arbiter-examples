import type { PaymentInfo } from "@x402r/core";
import type { Address } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { BASE_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE } from "../config.js";

// ---------------------------------------------------------------------------
// Viem clients
// ---------------------------------------------------------------------------

export function createClients() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("PRIVATE_KEY env var required");

  const account = privateKeyToAccount(privateKey);
  const transport = http(BASE_SEPOLIA_RPC);
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

  return { account, publicClient, walletClient };
}

// ---------------------------------------------------------------------------
// x402r SDK config
// ---------------------------------------------------------------------------

export function x402rConfig(
  addresses: Pick<SavedContext, "operatorAddress" | "escrowPeriodAddress">,
  clients: ReturnType<typeof createClients>,
) {
  return {
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
  };
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

interface SavedContext {
  operatorAddress: Address;
  escrowPeriodAddress: Address;
  arbiterConditionAddress: Address;
  paymentInfo?: PaymentInfo;
}

interface RawPaymentInfo {
  operator: Address;
  payer: Address;
  receiver: Address;
  token: Address;
  maxAmount: string;
  preApprovalExpiry: number;
  authorizationExpiry: number;
  refundExpiry: number;
  minFeeBps: number;
  maxFeeBps: number;
  feeReceiver: Address;
  salt: string;
}

export function loadContext(): SavedContext {
  if (!existsSync(CONTEXT_FILE)) {
    throw new Error(`${CONTEXT_FILE} not found — run pnpm run setup first`);
  }

  const raw = JSON.parse(readFileSync(CONTEXT_FILE, "utf-8"));

  let paymentInfo: PaymentInfo | undefined;
  if (raw.paymentInfo) {
    const pi = raw.paymentInfo as RawPaymentInfo;
    paymentInfo = {
      operator: pi.operator,
      payer: pi.payer,
      receiver: pi.receiver,
      token: pi.token,
      maxAmount: BigInt(pi.maxAmount),
      preApprovalExpiry: pi.preApprovalExpiry,
      authorizationExpiry: pi.authorizationExpiry,
      refundExpiry: pi.refundExpiry,
      minFeeBps: pi.minFeeBps,
      maxFeeBps: pi.maxFeeBps,
      feeReceiver: pi.feeReceiver,
      salt: BigInt(pi.salt),
    };
  }

  return {
    operatorAddress: raw.operatorAddress,
    escrowPeriodAddress: raw.escrowPeriodAddress,
    arbiterConditionAddress: raw.arbiterConditionAddress,
    paymentInfo,
  };
}
