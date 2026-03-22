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
}

interface RawPaymentInfo {
  operator: Address
  payer: Address
  receiver: Address
  token: Address
  maxAmount: string
  preApprovalExpiry: number
  authorizationExpiry: number
  refundExpiry: number
  minFeeBps: number
  maxFeeBps: number
  feeReceiver: Address
  salt: string
}

export function loadContext(): SavedContext {
  if (!existsSync(CONTEXT_FILE)) {
    throw new Error(`${CONTEXT_FILE} not found — run pnpm run setup first`)
  }

  const raw = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))

  let paymentInfo: PaymentInfo | undefined
  if (raw.paymentInfo) {
    const pi = raw.paymentInfo as RawPaymentInfo
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
    }
  }

  return {
    operatorAddress: raw.operatorAddress,
    escrowPeriodAddress: raw.escrowPeriodAddress,
    refundRequestAddress: raw.refundRequestAddress,
    refundRequestEvidenceAddress: raw.refundRequestEvidenceAddress,
    paymentInfo: paymentInfo!,
    arbitratorAddress: raw.arbitratorAddress,
    arbitratorDisputeID: raw.arbitratorDisputeID,
  }
}
