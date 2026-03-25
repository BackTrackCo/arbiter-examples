import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export const CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC =
  process.env.BASE_SEPOLIA_RPC ?? undefined; // uses viem default if unset

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// ---------------------------------------------------------------------------
// EigenAI
// ---------------------------------------------------------------------------

export const EIGENAI = {
  grantServer: process.env.EIGENAI_GRANT_SERVER ?? "https://determinal-api.eigenarcade.com",
  model: process.env.EIGENAI_MODEL ?? "gpt-oss-120b-f16",
  seed: Number(process.env.EIGENAI_SEED ?? 42),
} as const;

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)
export const CONTEXT_FILE = "context.json";
