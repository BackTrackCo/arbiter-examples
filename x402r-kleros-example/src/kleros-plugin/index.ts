import type { Address } from 'viem'
import { parseEventLogs } from 'viem'
import type { X402r } from '@x402r/sdk'
import { klerosCoreAbi } from '../kleros-contracts.js'
import {
  KlerosRuling,
  type KlerosActions,
  type KlerosConfig,
  type KlerosEvidence,
  type CreateDisputeResult,
} from './types.js'

// ---------------------------------------------------------------------------
// KlerosCoreRuler-specific ABI (not in @kleros/kleros-v2-contracts viem export)
// ---------------------------------------------------------------------------

const klerosRulerAbi = [
  {
    inputs: [{ name: '_arbitrable', type: 'address' }],
    name: 'changeRulingModeToManual',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const klerosRulerExecuteAbi = [
  {
    inputs: [
      { name: '_disputeID', type: 'uint256' },
      { name: '_ruling', type: 'uint256' },
      { name: 'tied', type: 'bool' },
      { name: 'overridden', type: 'bool' },
    ],
    name: 'executeRuling',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// ---------------------------------------------------------------------------
// DisputeResolverRuler ABI (subset we need)
// ---------------------------------------------------------------------------

const disputeResolverRulerAbi = [
  {
    inputs: [
      { name: '_arbitratorExtraData', type: 'bytes' },
      { name: '_disputeTemplate', type: 'string' },
      { name: '_disputeTemplateDataMappings', type: 'string' },
      { name: '_numberOfRulingOptions', type: 'uint256' },
    ],
    name: 'createDisputeForTemplate',
    outputs: [{ name: 'disputeID', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

// ---------------------------------------------------------------------------
// Plugin factory — accepts Kleros config, uses DisputeResolverRuler
// ---------------------------------------------------------------------------

export function klerosActions(config: KlerosConfig) {
  let rulingModeInitialized = false

  return (client: X402r): KlerosActions => ({
    kleros: {
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

        // Initialize ruling mode on first call — first caller becomes ruler
        if (!rulingModeInitialized) {
          console.log('  Setting ruling mode to manual...')
          const { request: modeReq } = await publicClient.simulateContract({
            account: walletClient.account!,
            address: config.arbitrator,
            abi: klerosRulerAbi,
            functionName: 'changeRulingModeToManual',
            args: [config.disputeResolver],
          })
          const modeTx = await walletClient.writeContract(modeReq)
          await publicClient.waitForTransactionReceipt({ hash: modeTx })
          console.log(`  Ruling mode set (tx: ${modeTx})`)
          rulingModeInitialized = true
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

      async giveKlerosRuling(disputeID, ruling) {
        const walletClient = client.config.walletClient
        const publicClient = client.config.publicClient
        if (!walletClient) {
          throw new Error('walletClient required for giveKlerosRuling')
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
            return client.refund.approve(paymentInfo, nonce, amount ?? 0n)
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
  IpfsUploader,
  IpfsFetcher,
} from './types.js'
export { createPinataUploader, pinataFetcher } from './ipfs.js'
