import type { Address, Hex } from 'viem'

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
  /** KlerosCoreRuler — mock arbitrator for instant testnet rulings (self-deployed) */
  klerosCoreRuler: '0x58d4348bb6aeab75d09483e407f348b8497d381a' as Address,
  /** abi.encode(uint96 courtId=1, uint256 minJurors=3) */
  extraData: '0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003' as Hex,
} as const

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 100_000n // 0.1 USDC (6 decimals)
export const FAR_FUTURE = 281_474_976_710_655 // max uint48 (number, not bigint — fits JS number)
export const CONTEXT_FILE = 'context.json'
