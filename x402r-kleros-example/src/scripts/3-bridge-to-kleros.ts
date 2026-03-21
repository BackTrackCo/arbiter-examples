import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync, readFileSync } from 'node:fs'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { klerosCoreAbi } from '../kleros-contracts.js'
import { klerosActions, pinataFetcher } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 3: Read x402r evidence, create dispute on KlerosCoreRuler
//
// Creates the dispute directly on KlerosCoreRuler so the Ruler UI can
// give instant rulings. Evidence stays on x402r (already submitted in
// script 2) — no EvidenceModule bridging needed for the toy flow.
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

  // --- Get arbitration cost from KlerosCoreRuler ---
  console.log('\n2. Getting Kleros arbitration cost...')
  // extraData encodes courtId (1 = General) and minJurors (3)
  const extraData = '0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003' as `0x${string}`
  const arbCost = await publicClient.readContract({
    address: KLEROS.klerosCoreRuler,
    abi: klerosCoreAbi,
    functionName: 'arbitrationCost',
    args: [extraData],
  })
  console.log(`  KlerosCoreRuler: ${KLEROS.klerosCoreRuler}`)
  console.log(`  Arbitration cost: ${arbCost} wei`)

  // --- Create dispute directly on KlerosCoreRuler ---
  console.log('\n3. Creating dispute on KlerosCoreRuler...')
  const { request } = await publicClient.simulateContract({
    account,
    address: KLEROS.klerosCoreRuler,
    abi: klerosCoreAbi,
    functionName: 'createDispute',
    args: [2n, extraData], // 2 choices: PayerWins(1) or ReceiverWins(2)
    value: arbCost,
  })
  const createTx = await walletClient.writeContract(request)
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTx })
  console.log(`  Create dispute tx: ${createTx} (block ${createReceipt.blockNumber})`)

  // --- Parse DisputeCreation event for dispute ID ---
  const [disputeEvent] = parseEventLogs({
    abi: klerosCoreAbi,
    logs: createReceipt.logs,
    eventName: 'DisputeCreation',
  })
  if (!disputeEvent) throw new Error('DisputeCreation event not found in receipt')

  const disputeID = disputeEvent.args._disputeID
  console.log(`  Dispute ID: ${disputeID}`)

  // --- Save dispute context ---
  const existing = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  existing.arbitratorAddress = KLEROS.klerosCoreRuler
  existing.arbitratorDisputeID = disputeID.toString()
  writeFileSync(CONTEXT_FILE, JSON.stringify(existing, null, 2))

  console.log(`\n=== Next steps ===`)
  console.log(`1. Go to: https://dev--kleros-v2-testnet-devtools.netlify.app/ruler`)
  console.log(`2. Connect wallet to Arbitrum Sepolia`)
  console.log(`3. In "Manual Ruling":`)
  console.log(`   - Dispute ID: ${disputeID}`)
  console.log(`   - Ruling: 1 (Payer Wins / Refund) or 2 (Receiver Wins / No Refund)`)
  console.log(`   - Tie: unchecked`)
  console.log(`   - Overridden: unchecked`)
  console.log(`4. Submit, then run: pnpm run ruling`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
