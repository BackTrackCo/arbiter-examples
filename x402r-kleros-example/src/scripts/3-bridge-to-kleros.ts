import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync, readFileSync } from 'node:fs'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { klerosActions, pinataFetcher } from '../kleros-plugin/index.js'
import {
  disputeResolverAbi,
  evidenceModuleAbi,
  klerosCoreRulerAbi,
} from '../kleros-abi/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 3: Read x402r evidence, create Kleros dispute, submit to Kleros
// ---------------------------------------------------------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  const { paymentInfo, ...addresses } = loadContext()
  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport,
  })
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport,
  })

  const arbiter = createArbiterClient({
    publicClient,
    walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
    refundRequestAddress: addresses.refundRequestAddress,
    refundRequestEvidenceAddress: addresses.refundRequestEvidenceAddress,
  }).extend(klerosActions)

  // --- Read structured evidence from x402r ---
  console.log('1. Reading structured evidence from x402r...')
  const evidence = await arbiter.kleros.getEvidence(paymentInfo, 0n, pinataFetcher)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
    if (e.fileURI) console.log(`    Attachment: ${e.fileURI}`)
  }

  // --- Get arbitration cost ---
  console.log('\n2. Getting Kleros arbitration cost...')
  const extraData = '0x' as const
  const arbCost = await publicClient.readContract({
    address: KLEROS.klerosCoreRuler,
    abi: klerosCoreRulerAbi,
    functionName: 'arbitrationCost',
    args: [extraData],
  })
  console.log(`  Arbitration cost: ${arbCost} wei`)

  // --- Create dispute template ---
  const disputeTemplate = JSON.stringify({
    title: 'x402r Refund Dispute',
    description: `Payer requests refund of payment to operator ${paymentInfo.operator}`,
    question: 'Should the payer receive a refund?',
    answers: [
      { title: 'Refund Payer', description: 'Approve the refund request' },
      { title: 'Pay Receiver', description: 'Deny the refund request' },
    ],
    policyURI: '/ipfs/QmTODO',
    frontendUrl: 'https://x402r.org',
    metadata: {
      operator: paymentInfo.operator,
      payer: paymentInfo.payer,
      receiver: paymentInfo.receiver,
      token: paymentInfo.token,
      amount: paymentInfo.maxAmount.toString(),
    },
  })

  // --- Create Kleros dispute ---
  console.log('\n3. Creating Kleros dispute...')
  const { request } = await publicClient.simulateContract({
    account: account.address,
    address: KLEROS.disputeResolver,
    abi: disputeResolverAbi,
    functionName: 'createDisputeForTemplate',
    args: [extraData, disputeTemplate, '', 2n],
    value: arbCost,
  })
  const createTx = await walletClient.writeContract(request)
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTx })
  console.log(`  Create dispute tx: ${createTx} (block ${createReceipt.blockNumber})`)

  // --- Parse DisputeRequest event to get dispute ID ---
  const disputeRequestTopic = '0x' as const // We'll find it from logs
  let externalDisputeID = 0n
  for (const log of createReceipt.logs) {
    if (log.address.toLowerCase() === KLEROS.disputeResolver.toLowerCase() && log.topics.length >= 3) {
      // DisputeRequest event: indexed _arbitrator, indexed _arbitrableDisputeID, _externalDisputeID
      externalDisputeID = BigInt(log.topics[2]!)
      console.log(`  Dispute ID (arbitrable): ${externalDisputeID}`)
      break
    }
  }

  // --- Submit evidence to Kleros EvidenceModule ---
  console.log('\n4. Submitting evidence to Kleros EvidenceModule...')
  for (const e of evidence) {
    const evidenceJSON = JSON.stringify(e)
    const { request: evReq } = await publicClient.simulateContract({
      account: account.address,
      address: KLEROS.evidenceModule,
      abi: evidenceModuleAbi,
      functionName: 'submitEvidence',
      args: [externalDisputeID, evidenceJSON],
    })
    const evTx = await walletClient.writeContract(evReq)
    await publicClient.waitForTransactionReceipt({ hash: evTx })
    console.log(`  Submitted "${e.name}" — tx: ${evTx}`)
  }

  // --- Save dispute context ---
  const existing = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  existing.disputeID = externalDisputeID.toString()
  writeFileSync(CONTEXT_FILE, JSON.stringify(existing, null, 2))

  console.log(`\nDispute ID: ${externalDisputeID}`)
  console.log('Go to Kleros Ruler UI to give a ruling, then run script 4.')
  console.log(`Ruler UI: https://ruler.kleros.io (connect to Arbitrum Sepolia)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
