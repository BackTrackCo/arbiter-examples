import type { Address } from 'viem'
import { parseEventLogs } from 'viem'
import type { X402r } from '@x402r/sdk'
import { klerosCoreAbi } from '../kleros-contracts.js'
import { deployToyArbitrable, toyArbitrableAbi } from './arbitrable.js'
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

// ---------------------------------------------------------------------------
// Plugin factory — accepts Kleros config, handles ToyArbitrable lifecycle
// ---------------------------------------------------------------------------

export function klerosActions(config: KlerosConfig) {
  let arbitrableAddress: Address | null = null

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

        // Deploy ToyArbitrable if not already deployed
        if (!arbitrableAddress) {
          console.log('  Deploying ToyArbitrable...')
          arbitrableAddress = await deployToyArbitrable(walletClient, publicClient)
          console.log(`  ToyArbitrable: ${arbitrableAddress}`)

          // Initialize ruling mode — first caller becomes ruler
          console.log('  Setting ruling mode to manual...')
          const { request: modeReq } = await publicClient.simulateContract({
            account: walletClient.account!,
            address: config.arbitrator,
            abi: klerosRulerAbi,
            functionName: 'changeRulingModeToManual',
            args: [arbitrableAddress],
          })
          const modeTx = await walletClient.writeContract(modeReq)
          await publicClient.waitForTransactionReceipt({ hash: modeTx })
          console.log(`  Ruling mode set (tx: ${modeTx})`)
        }

        // Get arbitration cost
        const arbCost = await publicClient.readContract({
          address: config.arbitrator,
          abi: klerosCoreAbi,
          functionName: 'arbitrationCost',
          args: [config.extraData],
        })

        // Create dispute through ToyArbitrable
        const { request } = await publicClient.simulateContract({
          account: walletClient.account!,
          address: arbitrableAddress,
          abi: toyArbitrableAbi,
          functionName: 'createDispute',
          args: [config.arbitrator, 2n, config.extraData], // 2 choices: PayerWins(1) or ReceiverWins(2)
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
          arbitrableAddress,
          txHash,
        }
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
