import { createArbiterClient } from '@x402r/sdk'
import { PAYMENT_AMOUNT } from '../config.js'
import { klerosActions, KlerosRuling } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Arbiter: Review evidence, give Kleros ruling, execute on x402r
//
// Usage: pnpm run arbiter [1|2]
//   1 = Payer Wins (Refund)
//   2 = Receiver Wins (No Refund)
// ---------------------------------------------------------------------------

async function main() {
  const rulingArg = process.argv[2] ? parseInt(process.argv[2]) : 0
  if (rulingArg < 1 || rulingArg > 2) {
    console.log('Usage: pnpm run arbiter [1|2]')
    console.log('  1 = Payer Wins (Refund)')
    console.log('  2 = Receiver Wins (No Refund)')
    process.exit(1)
  }

  const clients = createClients()
  const { publicClient } = clients
  const { paymentInfo, arbitratorDisputeID: rawID, ...addresses } = loadContext()
  if (rawID === undefined) throw new Error('No dispute in context — run client first')
  const disputeID = BigInt(rawID)

  const arbiter = createArbiterClient(x402rConfig(addresses, clients))
    .extend(klerosActions(klerosConfig()))

  // --- 1. Review evidence ---
  console.log('1. Reviewing evidence...')
  const evidence = await arbiter.kleros.getEvidence(paymentInfo, 0n)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 2. Resolve dispute (Kleros ruling + x402r execute) ---
  const ruling = rulingArg as KlerosRuling
  const label = ruling === KlerosRuling.PayerWins ? 'Payer Wins (Refund)' : 'Receiver Wins (No Refund)'
  console.log(`\n2. Resolving dispute: ${ruling} — ${label}`)
  const result = await arbiter.kleros.resolveDispute(disputeID, paymentInfo, 0n, ruling, PAYMENT_AMOUNT)
  console.log(`  Kleros ruling tx: ${result.rulingTxHash}`)
  if (result.executeTxHash) {
    await publicClient.waitForTransactionReceipt({ hash: result.executeTxHash })
    console.log(`  x402r execute tx: ${result.executeTxHash}`)
  }

  // --- 3. Verify ---
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
