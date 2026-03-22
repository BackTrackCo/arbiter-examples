import type { PaymentInfo } from '@x402r/core'
import type { Address } from 'viem'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { existsSync, readFileSync } from 'node:fs'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { createPinataUploader, pinataFetcher, type KlerosConfig } from '../kleros-plugin/index.js'

// ---------------------------------------------------------------------------
// Viem clients
// ---------------------------------------------------------------------------

export function createClients() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

  return { account, publicClient, walletClient }
}

// ---------------------------------------------------------------------------
// Kleros config
// ---------------------------------------------------------------------------

export function klerosConfig(): KlerosConfig {
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  return {
    arbitrator: KLEROS.klerosCoreRuler,
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(process.env.PINATA_JWT),
    ipfsFetcher: pinataFetcher,
  }
}

// ---------------------------------------------------------------------------
// x402r SDK config
// ---------------------------------------------------------------------------

export function x402rConfig(
  addresses: Pick<SavedContext, 'operatorAddress' | 'escrowPeriodAddress' | 'refundRequestAddress' | 'refundRequestEvidenceAddress'>,
  clients: ReturnType<typeof createClients>,
) {
  return {
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
    refundRequestAddress: addresses.refundRequestAddress,
    refundRequestEvidenceAddress: addresses.refundRequestEvidenceAddress,
  }
}

// ---------------------------------------------------------------------------
// PaymentInfo serialization (for context.json)
// ---------------------------------------------------------------------------

export function serializePaymentInfo(pi: PaymentInfo) {
  return {
    operator: pi.operator,
    payer: pi.payer,
    receiver: pi.receiver,
    token: pi.token,
    maxAmount: pi.maxAmount.toString(),
    preApprovalExpiry: pi.preApprovalExpiry,
    authorizationExpiry: pi.authorizationExpiry,
    refundExpiry: pi.refundExpiry,
    minFeeBps: pi.minFeeBps,
    maxFeeBps: pi.maxFeeBps,
    feeReceiver: pi.feeReceiver,
    salt: pi.salt.toString(),
  }
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

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
