import { parseEventLogs } from 'viem'
import type { Hash } from 'viem'
import type { X402r } from '@x402r/sdk'
import { ValidationError, type PaymentInfo } from '@x402r/core'
import {
  klerosCoreAbi,
  klerosRulerExecuteAbi,
  arbitrableX402rAbi,
} from './abi.js'
import {
  KlerosRuling,
  type KlerosActions,
  type KlerosConfig,
  type KlerosEvidence,
  type CreateDisputeResult,
  type RequestResult,
  type ExecuteResult,
  type EvidenceResult,
  type DisputeInfo,
  type X402rDisputeData,
} from './types.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireAccount(client: X402r) {
  const walletClient = client.config.walletClient
  if (!walletClient) throw new ValidationError('walletClient required')
  const account = walletClient.account
  if (!account) throw new ValidationError('walletClient must have an account set')
  return { walletClient, account, publicClient: client.config.publicClient }
}

async function createKlerosDispute(
  client: X402r,
  config: KlerosConfig,
  paymentInfo: PaymentInfo,
  refundAmount: bigint,
): Promise<CreateDisputeResult> {
  const { walletClient, account, publicClient } = requireAccount(client)
  const refundRequestAddress = client.config.refundRequestAddress!

  const arbCost = await publicClient.readContract({
    address: config.arbitrableX402r,
    abi: arbitrableX402rAbi,
    functionName: 'arbitrationCost',
    args: [config.extraData],
  })

  const { request } = await publicClient.simulateContract({
    account,
    address: config.arbitrableX402r,
    abi: arbitrableX402rAbi,
    functionName: 'createDispute',
    args: [refundRequestAddress, paymentInfo, refundAmount, config.extraData],
    value: arbCost,
  })
  const txHash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  const [disputeEvent] = parseEventLogs({
    abi: arbitrableX402rAbi,
    logs: receipt.logs,
    eventName: 'DisputeCreated',
  })
  if (!disputeEvent) throw new Error('DisputeCreated event not found in receipt')

  return {
    arbitratorDisputeID: disputeEvent.args.arbitratorDisputeID,
    localDisputeID: disputeEvent.args.localDisputeID,
    txHash,
  }
}

async function submitKlerosEvidence(
  client: X402r,
  config: KlerosConfig,
  evidence: KlerosEvidence,
  arbitratorDisputeID: bigint,
): Promise<EvidenceResult> {
  if (!config.ipfsUploader) throw new ValidationError('ipfsUploader required for submitEvidence — provide it in KlerosConfig')
  const { walletClient, account } = requireAccount(client)

  // Upload evidence to IPFS
  const cid = await config.ipfsUploader(evidence)

  // Submit CID to ArbitrableX402r (emits Evidence event for Kleros UI)
  const { request } = await client.config.publicClient.simulateContract({
    account,
    address: config.arbitrableX402r,
    abi: arbitrableX402rAbi,
    functionName: 'submitEvidence',
    args: [arbitratorDisputeID, `/ipfs/${cid}`],
  })
  const txHash = await walletClient.writeContract(request)

  return { txHash }
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function klerosActions(config: KlerosConfig) {
  return (client: X402r): KlerosActions => {
    // Validate SDK dependencies eagerly at extend() time
    if (!client.refund) throw new ValidationError('klerosActions requires refundRequestAddress in X402rConfig')

    return {
      kleros: {
        async request(paymentInfo, amount, evidence): Promise<RequestResult> {
          // 1. Request refund on x402r (uses SDK's refund.request)
          const requestTxHash = await client.refund!.request(paymentInfo, amount)
          await client.config.publicClient.waitForTransactionReceipt({ hash: requestTxHash })

          // 2. Create Kleros dispute on ArbitrableX402r
          const dispute = await createKlerosDispute(client, config, paymentInfo, amount)

          // 3. Optional: submit evidence to Kleros
          const result: RequestResult = { requestTxHash, dispute }
          if (evidence && config.ipfsUploader) {
            const ev = await submitKlerosEvidence(client, config, evidence, dispute.arbitratorDisputeID)
            result.evidenceTxHash = ev.txHash
          }

          return result
        },

        async execute(localDisputeID, paymentInfo): Promise<ExecuteResult> {
          const { walletClient, account, publicClient } = requireAccount(client)

          const { request } = await publicClient.simulateContract({
            account,
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            functionName: 'executeRuling',
            args: [localDisputeID, paymentInfo],
          })
          const txHash = await walletClient.writeContract(request)
          await publicClient.waitForTransactionReceipt({ hash: txHash })

          return { txHash }
        },

        async giveRuling(arbitratorDisputeID, ruling): Promise<Hash> {
          const { walletClient, account, publicClient } = requireAccount(client)

          const { request } = await publicClient.simulateContract({
            account,
            address: config.arbitrator,
            abi: klerosRulerExecuteAbi,
            functionName: 'executeRuling',
            args: [arbitratorDisputeID, BigInt(ruling), false, false],
          })
          const hash = await walletClient.writeContract(request)
          await publicClient.waitForTransactionReceipt({ hash })
          return hash
        },

        async submitEvidence(evidence, arbitratorDisputeID): Promise<EvidenceResult> {
          return submitKlerosEvidence(client, config, evidence, arbitratorDisputeID)
        },

        async getEvidence(arbitratorDisputeID): Promise<KlerosEvidence[]> {
          if (!config.ipfsFetcher) throw new ValidationError('ipfsFetcher required for getEvidence — provide it in KlerosConfig')

          const logs = await client.config.publicClient.getContractEvents({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            eventName: 'Evidence',
            args: { _arbitratorDisputeID: arbitratorDisputeID },
            fromBlock: 0n,
          })
          if (logs.length === 0) return []

          const results = await Promise.all(
            logs.map(async (log) => {
              const evidenceURI = log.args._evidence!
              const cid = evidenceURI.startsWith('/ipfs/') ? evidenceURI.slice(6) : evidenceURI
              const json = await config.ipfsFetcher!(cid)
              return JSON.parse(json) as KlerosEvidence
            }),
          )
          return results
        },

        async getRuling(disputeID): Promise<KlerosRuling> {
          const [ruling] = await client.config.publicClient.readContract({
            address: config.arbitrator,
            abi: klerosCoreAbi,
            functionName: 'currentRuling',
            args: [disputeID],
          })
          const value = Number(ruling)
          if (!(value in KlerosRuling)) throw new Error(`Unknown ruling value: ${ruling}`)
          return value as KlerosRuling
        },

        async getDispute(localDisputeID): Promise<X402rDisputeData> {
          const result = await client.config.publicClient.readContract({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            functionName: 'getX402rDispute',
            args: [localDisputeID],
          })
          return {
            refundRequest: result.refundRequest,
            refundAmount: result.refundAmount,
            executed: result.executed,
          }
        },

        async getDisputeCount(): Promise<bigint> {
          return client.config.publicClient.readContract({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            functionName: 'disputeCount',
          })
        },

        async getArbitratorDisputeID(localDisputeID): Promise<bigint> {
          const logs = await client.config.publicClient.getContractEvents({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            eventName: 'DisputeCreated',
            args: { localDisputeID },
            fromBlock: 0n,
          })
          if (logs.length === 0) throw new Error(`No DisputeCreated event found for localDisputeID ${localDisputeID}`)
          return logs[0].args.arbitratorDisputeID!
        },

        async getLatestDispute(): Promise<DisputeInfo> {
          const count = await client.config.publicClient.readContract({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            functionName: 'disputeCount',
          })
          if (count === 0n) throw new Error('No disputes found on ArbitrableX402r')

          const localDisputeID = count - 1n

          const result = await client.config.publicClient.readContract({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            functionName: 'getX402rDispute',
            args: [localDisputeID],
          })
          const dispute: X402rDisputeData = {
            refundRequest: result.refundRequest,
            refundAmount: result.refundAmount,
            executed: result.executed,
          }

          const logs = await client.config.publicClient.getContractEvents({
            address: config.arbitrableX402r,
            abi: arbitrableX402rAbi,
            eventName: 'DisputeCreated',
            args: { localDisputeID },
            fromBlock: 0n,
          })
          if (logs.length === 0) throw new Error(`No DisputeCreated event found for localDisputeID ${localDisputeID}`)
          const arbitratorDisputeID = logs[0].args.arbitratorDisputeID!

          return { localDisputeID, arbitratorDisputeID, dispute }
        },
      },
    }
  }
}

export { KlerosRuling } from './types.js'
export type {
  KlerosEvidence,
  KlerosActions,
  KlerosConfig,
  CreateDisputeResult,
  RequestResult,
  ExecuteResult,
  EvidenceResult,
  DisputeInfo,
  X402rDisputeData,
  IpfsUploader,
  IpfsFetcher,
} from './types.js'
export { createPinataUploader, pinataFetcher } from './ipfs.js'
