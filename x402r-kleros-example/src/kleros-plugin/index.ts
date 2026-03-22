import type { Address } from 'viem'
import { parseEventLogs } from 'viem'
import type { X402r } from '@x402r/sdk'
import {
  klerosCoreAbi,
  klerosRulerExecuteAbi,
  disputeResolverRulerAbi,
} from './abi.js'
import {
  KlerosRuling,
  type KlerosActions,
  type KlerosConfig,
  type KlerosEvidence,
  type CreateDisputeResult,
  type DisputeRefundResult,
  type ResolveDisputeResult,
} from './types.js'

// ---------------------------------------------------------------------------
// Plugin factory — accepts Kleros config, uses DisputeResolverRuler
// ---------------------------------------------------------------------------

export function klerosActions(config: KlerosConfig) {
  return (client: X402r): KlerosActions => ({
    kleros: {
      async disputeRefund(paymentInfo, amount, nonce, evidence): Promise<DisputeRefundResult> {
        if (!client.refund) {
          throw new Error('Refund module not available — provide refundRequestAddress')
        }
        const requestTxHash = await client.refund.request(paymentInfo, amount, nonce)
        await client.config.publicClient.waitForTransactionReceipt({ hash: requestTxHash })

        const evidenceTxHash = await this.submitEvidence(paymentInfo, nonce, evidence)
        await client.config.publicClient.waitForTransactionReceipt({ hash: evidenceTxHash })

        const dispute = await this.createDispute(paymentInfo, nonce)

        return { requestTxHash, evidenceTxHash, dispute }
      },

      async resolveDispute(disputeID, paymentInfo, nonce, ruling, amount): Promise<ResolveDisputeResult> {
        const rulingTxHash = await this.giveRuling(disputeID, ruling)
        const executeTxHash = await this.executeRuling(paymentInfo, nonce, ruling, amount)
        return { rulingTxHash, executeTxHash }
      },

      async submitEvidence(paymentInfo, nonce, evidence) {
        if (!client.evidence) {
          throw new Error('Evidence module not available — provide refundRequestEvidenceAddress')
        }
        const json = JSON.stringify(evidence)
        const cid = await config.ipfsUploader(json)
        return client.evidence.submit(paymentInfo, nonce, cid)
      },

      async getEvidence(paymentInfo, nonce) {
        if (!client.evidence) {
          throw new Error('Evidence module not available — provide refundRequestEvidenceAddress')
        }
        const count = await client.evidence.count(paymentInfo, nonce)
        if (count === 0n) return []

        const batch = await client.evidence.getBatch(paymentInfo, nonce, 0n, count)
        const results: KlerosEvidence[] = []
        for (const entry of batch.entries) {
          const json = await config.ipfsFetcher(entry.cid)
          results.push(JSON.parse(json) as KlerosEvidence)
        }
        return results
      },

      async createDispute(paymentInfo, nonce): Promise<CreateDisputeResult> {
        const walletClient = client.config.walletClient
        const publicClient = client.config.publicClient
        if (!walletClient) {
          throw new Error('walletClient required for createDispute')
        }

        // Get arbitration cost
        const arbCost = await publicClient.readContract({
          address: config.arbitrator,
          abi: klerosCoreAbi,
          functionName: 'arbitrationCost',
          args: [config.extraData],
        })

        // Create dispute through DisputeResolverRuler
        const { request } = await publicClient.simulateContract({
          account: walletClient.account!,
          address: config.disputeResolver,
          abi: disputeResolverRulerAbi,
          functionName: 'createDisputeForTemplate',
          args: [config.extraData, '', '', 2n], // 2 ruling options: PayerWins(1) or ReceiverWins(2)
          value: arbCost,
        })
        const txHash = await walletClient.writeContract(request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

        // Parse DisputeCreation event from KlerosCoreRuler logs
        const [disputeEvent] = parseEventLogs({
          abi: klerosCoreAbi,
          logs: receipt.logs,
          eventName: 'DisputeCreation',
        })
        if (!disputeEvent) throw new Error('DisputeCreation event not found in receipt')

        return {
          disputeID: disputeEvent.args._disputeID,
          arbitrableAddress: config.disputeResolver,
          txHash,
        }
      },

      async giveRuling(disputeID, ruling) {
        const walletClient = client.config.walletClient
        const publicClient = client.config.publicClient
        if (!walletClient) {
          throw new Error('walletClient required for giveRuling')
        }
        const { request } = await publicClient.simulateContract({
          account: walletClient.account!,
          address: config.arbitrator,
          abi: klerosRulerExecuteAbi,
          functionName: 'executeRuling',
          args: [disputeID, BigInt(ruling), false, false],
        })
        const hash = await walletClient.writeContract(request)
        await publicClient.waitForTransactionReceipt({ hash })
        return hash
      },

      async getRuling(disputeID): Promise<KlerosRuling> {
        const [ruling] = await client.config.publicClient.readContract({
          address: config.arbitrator,
          abi: klerosCoreAbi,
          functionName: 'currentRuling',
          args: [disputeID],
        })
        return Number(ruling) as KlerosRuling
      },

      async executeRuling(paymentInfo, nonce, ruling, amount) {
        if (!client.refund) {
          throw new Error('Refund module not available — provide refundRequestAddress')
        }
        switch (ruling) {
          case KlerosRuling.PayerWins:
            return client.refund.approve(paymentInfo, nonce, amount)
          case KlerosRuling.ReceiverWins:
            return client.refund.deny(paymentInfo, nonce)
          case KlerosRuling.RefusedToArbitrate:
            return null
        }
      },
    },
  })
}

export { KlerosRuling } from './types.js'
export type {
  KlerosEvidence,
  KlerosActions,
  KlerosConfig,
  CreateDisputeResult,
  DisputeRefundResult,
  ResolveDisputeResult,
  IpfsUploader,
  IpfsFetcher,
} from './types.js'
export { createPinataUploader, pinataFetcher } from './ipfs.js'
