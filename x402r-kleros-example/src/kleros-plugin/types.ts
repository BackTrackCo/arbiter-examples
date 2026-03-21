import type { Hash } from 'viem'
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
// Plugin actions
// ---------------------------------------------------------------------------

export interface KlerosActions {
  kleros: {
    submitEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      evidence: KlerosEvidence,
      uploader: IpfsUploader,
    ): Promise<Hash>

    getEvidence(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      fetcher: IpfsFetcher,
    ): Promise<KlerosEvidence[]>

    executeRuling(
      paymentInfo: PaymentInfo,
      nonce: bigint,
      ruling: KlerosRuling,
      amount?: bigint,
    ): Promise<Hash | null>
  }
}
