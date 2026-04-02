import type { Address, Hash, Hex } from 'viem'
import type { PaymentInfo } from '@x402r/core'

// ---------------------------------------------------------------------------
// Evidence
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
}

export interface ExecuteResult {
  txHash: Hash
}

export interface EvidenceResult {
  txHash: Hash
}

export interface DisputeInfo {
  localDisputeID: bigint
  arbitratorDisputeID: bigint
  dispute: X402rDisputeData
}

export interface X402rDisputeData {
  refundRequest: Address
  refundAmount: bigint
  executed: boolean
}

// ---------------------------------------------------------------------------
// Plugin actions
// Uses `type` (not `interface`) so it satisfies Record<string, unknown> for .extend()
// ---------------------------------------------------------------------------

export type KlerosActions = {
  kleros: {
    /** Request refund + create Kleros dispute + optional dual evidence. */
    request(
      paymentInfo: PaymentInfo,
      amount: bigint,
      evidence?: KlerosEvidence,
    ): Promise<RequestResult>

    /** Execute a stored Kleros ruling on x402r. Permissionless. Works on testnet and mainnet. */
    execute(
      localDisputeID: bigint,
      paymentInfo: PaymentInfo,
    ): Promise<ExecuteResult>

    /** Give a ruling via KlerosCoreRuler. Testnet only — simulates jurors. */
    giveRuling(
      arbitratorDisputeID: bigint,
      ruling: KlerosRuling,
    ): Promise<Hash>

    /** Upload evidence to IPFS and submit CID to ArbitrableX402r. */
    submitEvidence(
      evidence: KlerosEvidence,
      arbitratorDisputeID: bigint,
    ): Promise<EvidenceResult>

    /** Fetch evidence from ArbitrableX402r Evidence events + resolve CIDs from IPFS. */
    getEvidence(
      arbitratorDisputeID: bigint,
    ): Promise<KlerosEvidence[]>

    /** Read current ruling from KlerosCore. */
    getRuling(disputeID: bigint): Promise<KlerosRuling>

    /** Read x402r dispute data from ArbitrableX402r. */
    getDispute(localDisputeID: bigint): Promise<X402rDisputeData>

    /** Get the latest dispute with both IDs resolved. */
    getLatestDispute(): Promise<DisputeInfo>

    /** Number of disputes created on ArbitrableX402r. */
    getDisputeCount(): Promise<bigint>

    /** Look up arbitratorDisputeID from DisputeCreated event logs. */
    getArbitratorDisputeID(localDisputeID: bigint): Promise<bigint>
  }
}
