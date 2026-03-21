import type { Address } from 'viem'
import { disputeResolverAddress, evidenceModuleAddress } from './kleros-contracts.js'

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export const CHAIN_ID = 421614
export const ARBITRUM_SEPOLIA_RPC =
  process.env.ARBITRUM_SEPOLIA_RPC ?? 'https://sepolia-rollup.arbitrum.io/rpc'

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const USDC: Address = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'

// ---------------------------------------------------------------------------
// Kleros — Arbitrum Sepolia
// ---------------------------------------------------------------------------

export const KLEROS = {
  /** KlerosCoreRuler — not in @kleros/kleros-v2-contracts (mock for testing) */
  klerosCoreRuler: '0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9' as Address,
  disputeResolver: disputeResolverAddress[421614],
  evidenceModule: evidenceModuleAddress[421614],
} as const

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000_000n // 10 USDC (6 decimals)
export const FAR_FUTURE = 281_474_976_710_655 // max uint48 (number, not bigint — fits JS number)
export const CONTEXT_FILE = 'context.json'
