import type { Address, Hash, Hex } from 'viem'
import type { PaymentInfo } from '@x402r/core'

// ---------------------------------------------------------------------------
// Evidence — ERC-1497 compatible
// ---------------------------------------------------------------------------

export interface KlerosEvidence {
  name: string
  description: string
  fileURI?: string // "/ipfs/Qm..." (optional attachment)
}

// ---------------------------------------------------------------------------
// Ruling
// ---------------------------------------------------------------------------

export enum KlerosRuling {
  RefusedToArbitrate = 0,
  PayerWins = 1,
  ReceiverWins = 2,
}

// ---------------------------------------------------------------------------
// IPFS helpers
// ---------------------------------------------------------------------------

export type IpfsUploader = (content: string) => Promise<string> // returns CID
export type IpfsFetcher = (cid: string) => Promise<string> // returns JSON string

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export interface KlerosConfig {
  arbitrator: Address // KlerosCoreRuler address
  disputeResolver: Address // DisputeResolverRuler address (implements rule())
  extraData: Hex // abi.encode(uint96 courtId, uint256 minJurors)
  ipfsUploader: IpfsUploader
  ipfsFetcher: IpfsFetcher
}

// ---------------------------------------------------------------------------
// Plugin return types
// ---------------------------------------------------------------------------

export interface CreateDisputeResult {
  disputeID: bigint
  arbitrableAddress: Address
  txHash: Hash
}

export interface DisputeRefundResult {
  requestTxHash: Hash
  evidenceTxHash: Hash
  dispute: CreateDisputeResult
}

export interface ResolveDisputeResult {
  rulingTxHash: Hash
  executeTxHash: Hash | null
}

// ---------------------------------------------------------------------------
// Plugin actions
// ---------------------------------------------------------------------------

export interface KlerosActions {
  [key: string]: unknown
  kleros: {
    /** Request refund + submit payer evidence + create Kleros dispute in one call. */
    disputeRefund(
      paymentInfo: PaymentInfo,
      amount: bigint,
      nonce: bigint,
      evidence: KlerosEvidence,
    ): Promise<DisputeRefundResult>

    /** Give Kleros ruling + execute on x402r in one call. */
    resolveDispute(
      disputeID: bigint,
      paymentInfo: PaymentInfo,
      nonce: bigint,
      ruling: KlerosRuling,
      amount: bigint,
    ): Promise<ResolveDisputeResult>

    submitEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      evidence: KlerosEvidence,
    ): Promise<Hash>

    getEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
    ): Promise<KlerosEvidence[]>

    createDispute(
      paymentInfo: PaymentInfo,
      nonce: bigint,
    ): Promise<CreateDisputeResult>

    giveRuling(
      disputeID: bigint,
      ruling: KlerosRuling,
    ): Promise<Hash>

    getRuling(disputeID: bigint): Promise<KlerosRuling>

    executeRuling(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      ruling: KlerosRuling,
      amount: bigint,
    ): Promise<Hash | null>
  }
}
