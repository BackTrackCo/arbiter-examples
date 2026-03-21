import type { X402r } from '@x402r/sdk'
import { KlerosRuling, type KlerosActions, type KlerosEvidence } from './types.js'

export function klerosActions(client: X402r): KlerosActions {
  return {
    kleros: {
      async submitEvidence(paymentInfo, nonce, evidence, uploader) {
        if (!client.evidence) {
          throw new Error('Evidence module not available — provide refundRequestEvidenceAddress')
        }
        const json = JSON.stringify(evidence)
        const cid = await uploader(json)
        console.log(`  IPFS uploaded: ${cid}`)
        return client.evidence.submit(paymentInfo, nonce, cid)
      },

      async getEvidence(paymentInfo, nonce, fetcher) {
        if (!client.evidence) {
          throw new Error('Evidence module not available — provide refundRequestEvidenceAddress')
        }
        const count = await client.evidence.count(paymentInfo, nonce)
        if (count === 0n) return []

        const batch = await client.evidence.getBatch(paymentInfo, nonce, 0n, count)
        const results: KlerosEvidence[] = []
        for (const entry of batch.entries) {
          const json = await fetcher(entry.cid)
          results.push(JSON.parse(json) as KlerosEvidence)
        }
        return results
      },

      async executeRuling(paymentInfo, nonce, ruling, amount) {
        if (!client.refund) {
          throw new Error('Refund module not available — provide refundRequestAddress')
        }
        switch (ruling) {
          case KlerosRuling.PayerWins:
            return client.refund.approve(paymentInfo, nonce, amount ?? 0n)
          case KlerosRuling.ReceiverWins:
            return client.refund.deny(paymentInfo, nonce)
          case KlerosRuling.RefusedToArbitrate:
            return null
        }
      },
    },
  }
}

export { KlerosRuling } from './types.js'
export type { KlerosEvidence, KlerosActions, IpfsUploader, IpfsFetcher } from './types.js'
export { pinataUploader, pinataFetcher } from './ipfs.js'
