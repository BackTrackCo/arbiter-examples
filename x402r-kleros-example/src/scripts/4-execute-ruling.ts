import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, KLEROS, PAYMENT_AMOUNT } from '../config.js'
import { klerosActions, KlerosRuling, createPinataUploader, pinataFetcher } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 4: Read Kleros ruling, execute on x402r via plugin
// ---------------------------------------------------------------------------

const RULING_LABELS: Record<number, string> = {
  [KlerosRuling.RefusedToArbitrate]: 'Refused to Arbitrate',
  [KlerosRuling.PayerWins]: 'Payer Wins (Refund)',
  [KlerosRuling.ReceiverWins]: 'Receiver Wins (No Refund)',
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  const { paymentInfo, arbitratorAddress, arbitratorDisputeID: rawID, ...addresses } = loadContext()
  if (!arbitratorAddress || rawID === undefined) throw new Error('No arbitrator data in context — run script 3 first')
  const arbitratorDisputeID = BigInt(rawID)

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
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(process.env.PINATA_JWT!),
    ipfsFetcher: pinataFetcher,
  }))

  // --- Read Kleros ruling via plugin ---
  console.log(`1. Reading Kleros ruling for dispute ${arbitratorDisputeID}...`)
  const ruling = await arbiter.kleros.getRuling(arbitratorDisputeID)
  console.log(`  Ruling: ${ruling} — ${RULING_LABELS[ruling] ?? 'Unknown'}`)

  if (ruling === KlerosRuling.RefusedToArbitrate) {
    console.log('\nNo ruling yet — use the Ruler UI to give a ruling first.')
    console.log('See instructions printed by script 3 (pnpm run dispute).')
    return
  }

  // --- Execute ruling on x402r via plugin ---
  console.log('\n2. Executing ruling on x402r...')
  const tx = await arbiter.kleros.executeRuling(
    paymentInfo,
    0n,
    ruling,
    PAYMENT_AMOUNT,
  )

  if (tx) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    console.log(`  Execute tx: ${tx} (block ${receipt.blockNumber})`)
  }

  // --- Verify ---
  console.log('\n3. Verifying refund status...')
  const request = await arbiter.refund!.get(paymentInfo, 0n)
  const statusLabels: Record<number, string> = {
    0: 'Pending',
    1: 'Approved',
    2: 'Denied',
    3: 'Cancelled',
    4: 'Refused',
  }
  console.log(`  Refund status: ${request.status} — ${statusLabels[request.status] ?? 'Unknown'}`)
  if (request.approvedAmount > 0n) {
    console.log(`  Approved amount: ${request.approvedAmount}`)
  }

  console.log('\nDone! Kleros ruling executed on x402r.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
