import { createMerchantClient } from '@x402r/sdk'
import { klerosActions } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Merchant: Review dispute and submit counter-evidence
//
// Run after: pnpm run client
// ---------------------------------------------------------------------------

async function main() {
  const clients = createClients()
  const ctx = loadContext()
  if (!ctx.paymentInfo || !ctx.arbitratorDisputeID) {
    throw new Error('No dispute in context — run client first')
  }

  const sdkConfig = x402rConfig(ctx, clients)
  const kConfig = klerosConfig(ctx.arbitrableX402rAddress)
  const merchant = createMerchantClient(sdkConfig).extend(klerosActions(kConfig))

  const arbitratorDisputeID = BigInt(ctx.arbitratorDisputeID)

  // --- 1. Review payer's evidence ---
  console.log('1. Reviewing payer evidence...')
  // nonce 0 = first refund request for this payment
  const evidence = await merchant.kleros.getEvidence(ctx.paymentInfo, 0n)
  for (const e of evidence) {
    console.log(`  - ${e.name}: ${e.description}`)
  }

  // --- 2. Submit counter-evidence ---
  console.log('\n2. Submitting counter-evidence...')
  const result = await merchant.kleros.submitEvidence(
    ctx.paymentInfo,
    0n,
    {
      name: 'Service Delivered',
      description: 'API was operational. Attached server logs showing 200 responses.',
    },
    arbitratorDisputeID,
  )
  // Wait for confirmation (caller's responsibility — submitEvidence returns hashes immediately)
  const { publicClient } = clients
  await publicClient.waitForTransactionReceipt({ hash: result.x402rTxHash })
  console.log(`  x402r evidence tx:   ${result.x402rTxHash}`)
  if (result.klerosTxHash) {
    await publicClient.waitForTransactionReceipt({ hash: result.klerosTxHash })
    console.log(`  Kleros evidence tx:  ${result.klerosTxHash}`)
  }

  console.log('\nDone. Run: pnpm run arbiter 1  (approve) or  pnpm run arbiter 2  (deny)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
