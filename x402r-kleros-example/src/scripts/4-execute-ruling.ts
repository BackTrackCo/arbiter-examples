import { createArbiterClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, KLEROS, PAYMENT_AMOUNT } from '../config.js'
import { klerosActions, KlerosRuling } from '../kleros-plugin/index.js'
import { klerosCoreRulerAbi } from '../kleros-abi/index.js'
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

  const { paymentInfo, disputeID: rawDisputeID, ...addresses } = loadContext()
  if (rawDisputeID === undefined) throw new Error('No disputeID in context — run script 3 first')
  const disputeID = BigInt(rawDisputeID)

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

  // --- Read Kleros ruling ---
  console.log(`1. Reading Kleros ruling for dispute ${disputeID}...`)
  const [ruling, tied, overridden] = await publicClient.readContract({
    address: KLEROS.klerosCoreRuler,
    abi: klerosCoreRulerAbi,
    functionName: 'currentRuling',
    args: [disputeID],
  })
  const rulingValue = Number(ruling) as KlerosRuling
  console.log(`  Ruling: ${rulingValue} — ${RULING_LABELS[rulingValue] ?? 'Unknown'}`)
  console.log(`  Tied: ${tied}, Overridden: ${overridden}`)

  if (rulingValue === KlerosRuling.RefusedToArbitrate) {
    console.log('\nRuling is "Refused to Arbitrate" — no action taken on x402r.')
    console.log('Use the Ruler UI to give a definitive ruling first.')
    return
  }

  // --- Execute ruling on x402r via plugin ---
  console.log('\n2. Executing ruling on x402r...')
  const arbiter = createArbiterClient({
    publicClient,
    walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
    refundRequestAddress: addresses.refundRequestAddress,
    refundRequestEvidenceAddress: addresses.refundRequestEvidenceAddress,
  }).extend(klerosActions)

  const tx = await arbiter.kleros.executeRuling(
    paymentInfo,
    0n,
    rulingValue,
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
