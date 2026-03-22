import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync, readFileSync } from 'node:fs'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { klerosActions, createPinataUploader, pinataFetcher } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 3: Read x402r evidence, create dispute on KlerosCoreRuler
//
// The plugin handles everything: deploys ToyArbitrable, initializes the
// ruling mode (making our wallet the ruler), and creates the dispute.
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
  }).extend(klerosActions({
    arbitrator: KLEROS.klerosCoreRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(process.env.PINATA_JWT!),
    ipfsFetcher: pinataFetcher,
  }))

  // --- Read structured evidence from x402r ---
  console.log('1. Reading structured evidence from x402r...')
  const evidence = await arbiter.kleros.getEvidence(paymentInfo, 0n)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
    if (e.fileURI) console.log(`    Attachment: ${e.fileURI}`)
  }

  // --- Create dispute via plugin (deploys ToyArbitrable + sets ruling mode + creates dispute) ---
  console.log('\n2. Creating dispute on KlerosCoreRuler...')
  const dispute = await arbiter.kleros.createDispute(paymentInfo, 0n)
  console.log(`  Dispute ID: ${dispute.disputeID}`)
  console.log(`  Arbitrable: ${dispute.arbitrableAddress}`)
  console.log(`  Tx: ${dispute.txHash}`)

  // --- Save dispute context ---
  const existing = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  existing.arbitratorAddress = KLEROS.klerosCoreRuler
  existing.arbitratorDisputeID = dispute.disputeID.toString()
  existing.arbitrableAddress = dispute.arbitrableAddress
  writeFileSync(CONTEXT_FILE, JSON.stringify(existing, null, 2))

  console.log(`\n=== Next steps ===`)
  console.log(`Give a ruling (1 = Payer Wins, 2 = Receiver Wins):`)
  console.log(`  pnpm run give-ruling 1`)
  console.log(`Then execute it on x402r:`)
  console.log(`  pnpm run ruling`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
