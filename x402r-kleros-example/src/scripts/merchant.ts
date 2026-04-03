import { createMerchantClient } from '@x402r/sdk'
import { klerosActions } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Merchant: Discover dispute on-chain, review evidence, submit counter-evidence
//
// The merchant discovers everything on-chain — no shared state with the payer.
// Run after: pnpm run client
// ---------------------------------------------------------------------------

async function main() {
  const clients = createClients()
  const { publicClient } = clients
  const ctx = loadContext()

  const sdkConfig = x402rConfig(ctx, clients)
  const kConfig = klerosConfig(ctx.arbitrableX402rAddress)
  const merchant = createMerchantClient(sdkConfig).extend(klerosActions(kConfig))

  // --- 1. Discover latest dispute on-chain ---
  console.log('1. Discovering dispute on-chain...')
  const { localDisputeID, arbitratorDisputeID, dispute } = await merchant.kleros.getLatestDispute()

  // Resolve paymentInfo from RefundRequest on-chain (merchant is the receiver)
  const { keys } = await merchant.refund!.getReceiverRequests(clients.account.address, 0n, 100n)
  const request = await merchant.refund!.getByKey(keys[keys.length - 1])
  const paymentInfo = await merchant.refund!.getStoredPaymentInfo(request.paymentInfoHash)
  console.log(`  Dispute ${localDisputeID} (arbID: ${arbitratorDisputeID}), payer: ${paymentInfo.payer}`)

  // --- 2. Review payer's evidence ---
  console.log('\n2. Reviewing payer evidence...')
  const evidence = await merchant.kleros.getEvidence(arbitratorDisputeID)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 3. Submit counter-evidence ---
  console.log('\n3. Submitting counter-evidence...')
  const result = await merchant.kleros.submitEvidence(
    {
      name: 'Service Delivered',
      description: 'API was operational. Attached server logs showing 200 responses.',
    },
    arbitratorDisputeID,
  )
  await publicClient.waitForTransactionReceipt({ hash: result.txHash })
  console.log(`  Evidence tx:         ${result.txHash}`)

  console.log('\nDone. Run: pnpm run arbiter 1  (approve) or  pnpm run arbiter 2  (deny)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
