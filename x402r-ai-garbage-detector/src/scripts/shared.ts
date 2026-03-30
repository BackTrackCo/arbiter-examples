import type { PaymentInfo } from "@x402r/core";
import type { Address, Chain, PublicClient, WalletClient } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync } from "node:fs";
import { CHAIN_IDS, CONTEXT_FILE, getViemChain } from "../config.js";

// ---------------------------------------------------------------------------
// Per-chain viem clients
// ---------------------------------------------------------------------------

export interface ChainClients {
  chain: Chain;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export function createClients() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("PRIVATE_KEY env var required");

  const account = privateKeyToAccount(privateKey);

  const chains = new Map<number, ChainClients>();
  for (const chainId of CHAIN_IDS) {
    const chain = getViemChain(chainId);
    const rpcEnv = process.env[`RPC_${chainId}`];
    const transport = http(rpcEnv);
    chains.set(chainId, {
      chain,
      publicClient: createPublicClient({ chain, transport }),
      walletClient: createWalletClient({ account, chain, transport }),
    });
  }

  // Default to the first chain for backward compat
  const defaultChainId = CHAIN_IDS[0];
  const defaultClients = chains.get(defaultChainId)!;

  return {
    account,
    chains,
    defaultChainId,
    // Backward compat — used by deploy scripts and single-chain paths
    publicClient: defaultClients.publicClient,
    walletClient: defaultClients.walletClient,
  };
}

/** Get clients for a specific chain, falling back to default. */
export function getChainClients(
  allClients: ReturnType<typeof createClients>,
  chainId: number,
): ChainClients {
  return allClients.chains.get(chainId) ?? allClients.chains.get(allClients.defaultChainId)!;
}

// ---------------------------------------------------------------------------
// x402r SDK config
// ---------------------------------------------------------------------------

export function x402rConfig(
  addresses: Pick<SavedContext, "operatorAddress" | "escrowPeriodAddress">,
  clients: ReturnType<typeof createClients>,
  chainId?: number,
) {
  const cid = chainId ?? clients.defaultChainId;
  const cc = getChainClients(clients, cid);
  return {
    publicClient: cc.publicClient,
    walletClient: cc.walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: cid,
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
