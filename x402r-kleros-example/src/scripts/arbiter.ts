import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, KLEROS, PAYMENT_AMOUNT } from '../config.js'
import { klerosActions, KlerosRuling, createPinataUploader, pinataFetcher } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Arbiter: Review evidence, give Kleros ruling, execute on x402r
//
// Usage: pnpm run arbiter [1|2]
//   1 = Payer Wins (Refund)
//   2 = Receiver Wins (No Refund)
// ---------------------------------------------------------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  const rulingArg = process.argv[2] ? parseInt(process.argv[2]) : 0
  if (rulingArg < 1 || rulingArg > 2) {
    console.log('Usage: pnpm run arbiter [1|2]')
    console.log('  1 = Payer Wins (Refund)')
    console.log('  2 = Receiver Wins (No Refund)')
    process.exit(1)
  }

  const { paymentInfo, arbitratorDisputeID: rawID, ...addresses } = loadContext()
  if (rawID === undefined) throw new Error('No dispute in context — run client first')
  const disputeID = BigInt(rawID)

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

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
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(process.env.PINATA_JWT!),
    ipfsFetcher: pinataFetcher,
  }))

  // --- 1. Review evidence ---
  console.log('1. Reviewing evidence...')
  const evidence = await arbiter.kleros.getEvidence(paymentInfo, 0n)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 2. Give ruling on Kleros ---
  const ruling = rulingArg as KlerosRuling
  const label = ruling === KlerosRuling.PayerWins ? 'Payer Wins (Refund)' : 'Receiver Wins (No Refund)'
  console.log(`\n2. Giving Kleros ruling: ${ruling} — ${label}`)
  const klerosRulingTx = await arbiter.kleros.giveKlerosRuling(disputeID, ruling)
  console.log(`  tx: ${klerosRulingTx}`)

  // --- 3. Execute on x402r ---
  console.log('\n3. Executing on x402r...')
  const tx = await arbiter.kleros.executeRuling(paymentInfo, 0n, ruling, PAYMENT_AMOUNT)
  if (tx) {
    await publicClient.waitForTransactionReceipt({ hash: tx })
    console.log(`  tx: ${tx}`)
  }

  // --- 4. Verify ---
  const request = await arbiter.refund!.get(paymentInfo, 0n)
  const statusLabels: Record<number, string> = {
    0: 'Pending', 1: 'Approved', 2: 'Denied', 3: 'Cancelled', 4: 'Refused',
  }
  console.log(`\nRefund status: ${statusLabels[request.status] ?? 'Unknown'}`)
  if (request.approvedAmount > 0n) {
    console.log(`Approved amount: ${request.approvedAmount}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
