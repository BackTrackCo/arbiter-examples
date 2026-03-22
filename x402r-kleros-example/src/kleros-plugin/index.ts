import { parseEventLogs } from 'viem'
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
  type ResolveResult,
  type EvidenceResult,
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
  nonce: bigint,
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
    args: [refundRequestAddress, paymentInfo, nonce, refundAmount, config.extraData],
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

async function resolveDispute(
  client: X402r,
  config: KlerosConfig,
  localDisputeID: bigint,
  arbitratorDisputeID: bigint,
  paymentInfo: PaymentInfo,
  ruling: KlerosRuling,
): Promise<ResolveResult> {
  const { walletClient, account, publicClient } = requireAccount(client)

  let rulingTxHash: ResolveResult['rulingTxHash'] = null

  // Check if already ruled (mainnet: Kleros jurors decide, ruling already stored)
  const dispute = await publicClient.readContract({
    address: config.arbitrableX402r,
    abi: arbitrableX402rAbi,
    functionName: 'disputes',
    args: [localDisputeID],
  })

  const [isRuled] = dispute
  if (!isRuled) {
    // Not yet ruled — give ruling via KlerosCoreRuler (testnet)
    const { request } = await publicClient.simulateContract({
      account,
      address: config.arbitrator,
      abi: klerosRulerExecuteAbi,
      functionName: 'executeRuling',
      args: [arbitratorDisputeID, BigInt(ruling), false, false],
    })
    rulingTxHash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash: rulingTxHash })
  }

  // Execute ruling on x402r (permissionless)
  const { request: execReq } = await publicClient.simulateContract({
    account,
    address: config.arbitrableX402r,
    abi: arbitrableX402rAbi,
    functionName: 'executeRuling',
    args: [localDisputeID, paymentInfo],
  })
  const executeTxHash = await walletClient.writeContract(execReq)
  await publicClient.waitForTransactionReceipt({ hash: executeTxHash })

  return { rulingTxHash, executeTxHash }
}

async function dualSubmitEvidence(
  client: X402r,
  config: KlerosConfig,
  paymentInfo: PaymentInfo,
  nonce: bigint,
  evidence: KlerosEvidence,
  arbitratorDisputeID?: bigint,
): Promise<EvidenceResult> {
  if (!config.ipfsUploader) throw new ValidationError('ipfsUploader required for submitEvidence — provide it in KlerosConfig')
  const { walletClient, account } = requireAccount(client)

  // Upload evidence to IPFS
  const cid = await config.ipfsUploader(evidence)

  // Submit to x402r RefundRequestEvidence
  const x402rTxHash = await client.evidence!.submit(paymentInfo, nonce, cid)
  // Wait between sequential txs from same wallet to avoid nonce conflicts
  await client.config.publicClient.waitForTransactionReceipt({ hash: x402rTxHash })

  // Submit to ArbitrableX402r (ERC-1497 Evidence event for Kleros UI)
  let klerosTxHash: EvidenceResult['klerosTxHash'] | undefined
  if (arbitratorDisputeID !== undefined) {
    const { request } = await client.config.publicClient.simulateContract({
      account,
      address: config.arbitrableX402r,
      abi: arbitrableX402rAbi,
      functionName: 'submitEvidence',
      args: [arbitratorDisputeID, `/ipfs/${cid}`],
    })
    klerosTxHash = await walletClient.writeContract(request)
  }

  return { x402rTxHash, klerosTxHash }
}

// ---------------------------------------------------------------------------
// Plugin factory — mirrors SDK action names (request/approve/deny)
// ---------------------------------------------------------------------------

export function klerosActions(config: KlerosConfig) {
  return (client: X402r): KlerosActions => {
    // Validate SDK dependencies eagerly at extend() time
    if (!client.refund) throw new ValidationError('klerosActions requires refundRequestAddress in X402rConfig')
    if (!client.evidence) throw new ValidationError('klerosActions requires refundRequestEvidenceAddress in X402rConfig')

    return {
      kleros: {
        async request(paymentInfo, amount, nonce, evidence): Promise<RequestResult> {
          // 1. Request refund on x402r (uses SDK's refund.request)
          const requestTxHash = await client.refund!.request(paymentInfo, amount, nonce)
          await client.config.publicClient.waitForTransactionReceipt({ hash: requestTxHash })

          // 2. Create Kleros dispute on ArbitrableX402r
          const dispute = await createKlerosDispute(client, config, paymentInfo, nonce, amount)

          // 3. Optional: submit dual evidence
          const result: RequestResult = { requestTxHash, dispute }
          if (evidence && config.ipfsUploader) {
            const ev = await dualSubmitEvidence(client, config, paymentInfo, nonce, evidence, dispute.arbitratorDisputeID)
            result.evidenceTxHash = ev.x402rTxHash
            result.klerosEvidenceTxHash = ev.klerosTxHash
          }

          return result
        },

        async approve(localDisputeID, arbitratorDisputeID, paymentInfo): Promise<ResolveResult> {
          return resolveDispute(client, config, localDisputeID, arbitratorDisputeID, paymentInfo, KlerosRuling.PayerWins)
        },

        async deny(localDisputeID, arbitratorDisputeID, paymentInfo): Promise<ResolveResult> {
          return resolveDispute(client, config, localDisputeID, arbitratorDisputeID, paymentInfo, KlerosRuling.ReceiverWins)
        },

        async submitEvidence(paymentInfo, nonce, evidence, arbitratorDisputeID): Promise<EvidenceResult> {
          return dualSubmitEvidence(client, config, paymentInfo, nonce, evidence, arbitratorDisputeID)
        },

        async getEvidence(paymentInfo, nonce): Promise<KlerosEvidence[]> {
          if (!config.ipfsFetcher) throw new ValidationError('ipfsFetcher required for getEvidence — provide it in KlerosConfig')

          const count = await client.evidence!.count(paymentInfo, nonce)
          if (count === 0n) return []

          const batch = await client.evidence!.getBatch(paymentInfo, nonce, 0n, count)
          const results = await Promise.all(
            batch.entries.map(async (entry) => {
              const json = await config.ipfsFetcher!(entry.cid)
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
            nonce: result.nonce,
            refundAmount: result.refundAmount,
            executed: result.executed,
          }
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
  ResolveResult,
  EvidenceResult,
  X402rDisputeData,
  IpfsUploader,
  IpfsFetcher,
} from './types.js'
export { createPinataUploader, pinataFetcher } from './ipfs.js'
