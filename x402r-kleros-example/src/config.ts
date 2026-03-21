import type { Address } from 'viem'

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
// x402r — unified CREATE3 addresses (same on every chain)
// ---------------------------------------------------------------------------

export const X402R = {
  authCaptureEscrow: '0xe050bB89eD43BB02d71343063824614A7fb80B77' as Address,
  tokenCollector: '0xcE66Ab399EDA513BD12760b6427C87D6602344a7' as Address,
  factories: {
    paymentOperator: '0xdc41F932dF2d22346F218E4f5650694c650ab863' as Address,
    escrowPeriod: '0x15DB06aADEB3a39D47756Bf864a173cc48bafe24' as Address,
    freeze: '0xdf129EFFE040c3403aca597c0F0bb704859a78Fd' as Address,
    refundRequest: '0x9cD87Bb58553Ef5ad90Ed6260EBdB906a50D6b83' as Address,
    refundRequestEvidence: '0x3769Be76BBEa31345A2B2d84EF90683E9A377e00' as Address,
  },
} as const

// ---------------------------------------------------------------------------
// Kleros — Arbitrum Sepolia
// ---------------------------------------------------------------------------

export const KLEROS = {
  klerosCoreRuler: '0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9' as Address,
  disputeResolver: '0xed31bEE8b1F7cE89E93033C0d3B2ccF4cEb27652' as Address,
  evidenceModule: '0xA88A9a25cE7f1d8b3941dA3b322Ba91D009E1397' as Address,
  disputeTemplateRegistry: '0xe763d31Cb096B4bc7294012B78FC7F148324ebcb' as Address,
} as const

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000_000n // 10 USDC (6 decimals)
export const FAR_FUTURE = 281_474_976_710_655 // max uint48 (number, not bigint — fits JS number)
export const CONTEXT_FILE = 'context.json'
