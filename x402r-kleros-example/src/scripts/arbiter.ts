import { createArbiterClient } from '@x402r/sdk'
import { klerosActions, KlerosRuling } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Arbiter: Discover dispute on-chain, review evidence, rule
//
// Usage: pnpm run arbiter [1|2]
//   1 = PayerWins (Refund)
//   2 = ReceiverWins (No Refund)
//
// On testnet, giveRuling() simulates Kleros jurors.
// On mainnet, jurors vote and rule() is called by KlerosCore automatically
// — skip giveRuling() and just call execute().
// ---------------------------------------------------------------------------

async function main() {
  const rulingArg = process.argv[2] ? parseInt(process.argv[2]) : 0
  if (rulingArg < 1 || rulingArg > 2) {
    console.log('Usage: pnpm run arbiter [1|2]')
    console.log('  1 = PayerWins (Refund)')
    console.log('  2 = ReceiverWins (No Refund)')
    process.exit(1)
  }

  const clients = createClients()
  const ctx = loadContext()

  const arbiter = createArbiterClient(x402rConfig(ctx, clients))
    .extend(klerosActions(klerosConfig(ctx.arbitrableX402rAddress)))

  // --- 1. Discover latest dispute on-chain ---
  console.log('1. Discovering dispute on-chain...')
  const { localDisputeID, arbitratorDisputeID, dispute } = await arbiter.kleros.getLatestDispute()
  console.log(`  Local dispute:   ${localDisputeID}`)
  console.log(`  Arbitrator ID:   ${arbitratorDisputeID}`)
  console.log(`  Nonce:           ${dispute.nonce}`)
  console.log(`  Refund amount:   ${dispute.refundAmount}`)

  if (dispute.executed) throw new Error('Dispute already executed')

  // Resolve paymentInfo from RefundRequest on-chain
  const { keys } = await arbiter.refund!.getOperatorRequests(ctx.operatorAddress, 0n, 100n)
  if (keys.length === 0) throw new Error('No refund requests found')
  const request = await arbiter.refund!.getByKey(keys[keys.length - 1])
  const paymentInfo = await arbiter.refund!.getStoredPaymentInfo(request.paymentInfoHash)
  console.log(`  Payer:           ${paymentInfo.payer}`)

  // --- 2. Review evidence ---
  console.log('\n2. Reviewing evidence...')
  // nonce 0 = first refund request for this payment
  const evidence = await arbiter.kleros.getEvidence(arbitratorDisputeID)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 3. Give ruling (testnet only — simulates Kleros jurors) ---
  const ruling = rulingArg as KlerosRuling
  const label = ruling === KlerosRuling.PayerWins ? 'PayerWins (Refund)' : 'ReceiverWins (No Refund)'
  console.log(`\n3. Giving ruling: ${label} (testnet — on mainnet, jurors vote)`)
  const rulingTxHash = await arbiter.kleros.giveRuling(arbitratorDisputeID, ruling)
  console.log(`  Ruling tx: ${rulingTxHash}`)

  // --- 4. Execute ruling on x402r (same on testnet and mainnet) ---
  console.log('\n4. Executing ruling on x402r...')
  const result = await arbiter.kleros.execute(localDisputeID, paymentInfo)
  console.log(`  Execute tx: ${result.txHash}`)

  // --- 5. Verify ---
  const finalRequest = await arbiter.refund!.get(paymentInfo, dispute.nonce)
  const statusLabels: Record<number, string> = {
    0: 'Pending', 1: 'Approved', 2: 'Denied', 3: 'Cancelled', 4: 'Refused',
  }
  console.log(`\nRefund status: ${statusLabels[finalRequest.status] ?? 'Unknown'}`)
  if (finalRequest.approvedAmount > 0n) {
    console.log(`Approved amount: ${finalRequest.approvedAmount}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
