import { createArbiterClient } from '@x402r/sdk'
import { klerosActions } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Arbiter: Review evidence, approve or deny refund (single call each)
//
// Usage: pnpm run arbiter [1|2]
//   1 = Approve (Payer Wins — Refund)
//   2 = Deny (Receiver Wins — No Refund)
//
// Internally: kleros.approve() / kleros.deny() handle both giveRuling
// (testnet) and executeRuling (bridges ruling to x402r) in one call.
// ---------------------------------------------------------------------------

async function main() {
  const rulingArg = process.argv[2] ? parseInt(process.argv[2]) : 0
  if (rulingArg < 1 || rulingArg > 2) {
    console.log('Usage: pnpm run arbiter [1|2]')
    console.log('  1 = Approve (Payer Wins — Refund)')
    console.log('  2 = Deny (Receiver Wins — No Refund)')
    process.exit(1)
  }

  const clients = createClients()
  const ctx = loadContext()
  if (!ctx.arbitratorDisputeID || !ctx.localDisputeID || !ctx.paymentInfo) {
    throw new Error('No dispute in context — run client first')
  }

  const arbitratorDisputeID = BigInt(ctx.arbitratorDisputeID)
  const localDisputeID = BigInt(ctx.localDisputeID)

  const arbiter = createArbiterClient(x402rConfig(ctx, clients))
    .extend(klerosActions(klerosConfig(ctx.arbitrableX402rAddress)))

  // --- 1. Review evidence ---
  console.log('1. Reviewing evidence...')
  // nonce 0 = first refund request for this payment
  const evidence = await arbiter.kleros.getEvidence(ctx.paymentInfo, 0n)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 2. Approve or deny (single call — handles ruling + execution) ---
  if (rulingArg === 1) {
    console.log('\n2. Approving refund (Payer Wins)...')
    const result = await arbiter.kleros.approve(localDisputeID, arbitratorDisputeID, ctx.paymentInfo)
    if (result.rulingTxHash) console.log(`  Ruling tx:  ${result.rulingTxHash}`)
    console.log(`  Execute tx: ${result.executeTxHash}`)
  } else {
    console.log('\n2. Denying refund (Receiver Wins)...')
    const result = await arbiter.kleros.deny(localDisputeID, arbitratorDisputeID, ctx.paymentInfo)
    if (result.rulingTxHash) console.log(`  Ruling tx:  ${result.rulingTxHash}`)
    console.log(`  Execute tx: ${result.executeTxHash}`)
  }

  // --- 3. Verify ---
  const request = await arbiter.refund!.get(ctx.paymentInfo, 0n)
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
