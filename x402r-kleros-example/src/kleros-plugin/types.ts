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

export type IpfsUploader = (content: unknown) => Promise<string> // returns CID
export type IpfsFetcher = (cid: string) => Promise<string> // returns JSON string

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export interface KlerosConfig {
  arbitrator: Address // KlerosCoreRuler address
  arbitrableX402r: Address // ArbitrableX402r address (IS the arbiter)
  extraData: Hex // abi.encode(uint96 courtId, uint256 minJurors)
  ipfsUploader?: IpfsUploader // needed for request() and submitEvidence()
  ipfsFetcher?: IpfsFetcher // needed for getEvidence()
}

// ---------------------------------------------------------------------------
// Plugin return types
// ---------------------------------------------------------------------------

export interface CreateDisputeResult {
  arbitratorDisputeID: bigint
  localDisputeID: bigint
  txHash: Hash
}

export interface RequestResult {
  requestTxHash: Hash
  dispute: CreateDisputeResult
  evidenceTxHash?: Hash
  klerosEvidenceTxHash?: Hash
}

export interface ResolveResult {
  rulingTxHash: Hash | null // null if already ruled (mainnet)
  executeTxHash: Hash
}

export interface EvidenceResult {
  x402rTxHash: Hash
  klerosTxHash?: Hash // only set when arbitratorDisputeID is provided
}

export interface X402rDisputeData {
  refundRequest: Address
  nonce: bigint
  refundAmount: bigint
  executed: boolean
}

// ---------------------------------------------------------------------------
// Plugin actions — mirrors SDK naming (request/approve/deny/submitEvidence/getEvidence)
// Uses `type` (not `interface`) so it satisfies Record<string, unknown> for .extend()
// ---------------------------------------------------------------------------

export type KlerosActions = {
  kleros: {
    /** Request refund + create Kleros dispute + optional dual evidence. Mirrors refund.request(). */
    request(
      paymentInfo: PaymentInfo,
      amount: bigint,
      nonce: bigint,
      evidence?: KlerosEvidence,
    ): Promise<RequestResult>

    /** Approve refund (PayerWins): give ruling + execute on x402r. Mirrors refund.approve(). */
    approve(
      localDisputeID: bigint,
      arbitratorDisputeID: bigint,
      paymentInfo: PaymentInfo,
    ): Promise<ResolveResult>

    /** Deny refund (ReceiverWins): give ruling + execute on x402r. Mirrors refund.deny(). */
    deny(
      localDisputeID: bigint,
      arbitratorDisputeID: bigint,
      paymentInfo: PaymentInfo,
    ): Promise<ResolveResult>

    /** Dual-channel evidence: IPFS + x402r + ArbitrableX402r. Mirrors evidence.submit(). */
    submitEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      evidence: KlerosEvidence,
      arbitratorDisputeID?: bigint,
    ): Promise<EvidenceResult>

    /** Fetch evidence from x402r + resolve CIDs from IPFS. Mirrors evidence.getBatch(). */
    getEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
    ): Promise<KlerosEvidence[]>

    /** Read current ruling from KlerosCore. */
    getRuling(disputeID: bigint): Promise<KlerosRuling>

    /** Read x402r dispute data from ArbitrableX402r. */
    getDispute(localDisputeID: bigint): Promise<X402rDisputeData>
  }
}
