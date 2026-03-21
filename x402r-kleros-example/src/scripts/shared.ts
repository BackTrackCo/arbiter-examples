import type { PaymentInfo } from '@x402r/core'
import type { Address } from 'viem'
import { existsSync, readFileSync } from 'node:fs'
import { CONTEXT_FILE } from '../config.js'

interface SavedContext {
  operatorAddress: Address
  escrowPeriodAddress: Address
  refundRequestAddress: Address
  refundRequestEvidenceAddress: Address
  paymentInfo: PaymentInfo
  arbitratorAddress?: Address
  arbitratorDisputeID?: string
  externalDisputeID?: string
}

interface RawPaymentInfo {
  operator: Address
  payer: Address
  receiver: Address
  token: Address
  maxAmount: string // bigint serialized as string
  preApprovalExpiry: number // uint48 → number
  authorizationExpiry: number
  refundExpiry: number
  minFeeBps: number
  maxFeeBps: number
  feeReceiver: Address
  salt: string // bigint serialized as string
}

export function loadContext(): SavedContext {
  if (!existsSync(CONTEXT_FILE)) {
    throw new Error(`${CONTEXT_FILE} not found — run script 1 first (pnpm run setup)`)
  }

  const raw = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  const pi = raw.paymentInfo as RawPaymentInfo

  return {
    operatorAddress: raw.operatorAddress,
    escrowPeriodAddress: raw.escrowPeriodAddress,
    refundRequestAddress: raw.refundRequestAddress,
    refundRequestEvidenceAddress: raw.refundRequestEvidenceAddress,
    arbitratorAddress: raw.arbitratorAddress,
    arbitratorDisputeID: raw.arbitratorDisputeID,
    externalDisputeID: raw.externalDisputeID,
    paymentInfo: {
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
    },
  }
}
