import { deployMarketplaceOperator } from '@x402r/core'
import { writeFileSync } from 'node:fs'
import { CHAIN_ID, CONTEXT_FILE } from '../config.js'
import { createClients } from './shared.js'

// ---------------------------------------------------------------------------
// Setup: Deploy marketplace operator (one-time)
// ---------------------------------------------------------------------------

async function main() {
  const { account, publicClient, walletClient } = createClients()

  console.log(`Wallet: ${account.address}`)
  console.log(`Chain:  Arbitrum Sepolia (${CHAIN_ID})`)

  console.log('\nDeploying marketplace operator...')
  const deployment = await deployMarketplaceOperator(
    walletClient,
    publicClient,
    {
      chainId: CHAIN_ID,
      feeRecipient: account.address,
      arbiter: account.address,
      escrowPeriodSeconds: 300n,
      operatorFeeBps: 50n,
    },
  )

  console.log(`  Operator:       ${deployment.operatorAddress}`)
  console.log(`  EscrowPeriod:   ${deployment.escrowPeriodAddress}`)
  console.log(`  RefundRequest:  ${deployment.refundRequestAddress}`)
  console.log(`  RefundEvidence: ${deployment.refundRequestEvidenceAddress}`)
  console.log(`  New: ${deployment.summary.newCount}, existing: ${deployment.summary.existingCount}`)

  const context = {
    operatorAddress: deployment.operatorAddress,
    escrowPeriodAddress: deployment.escrowPeriodAddress,
    refundRequestAddress: deployment.refundRequestAddress,
    refundRequestEvidenceAddress: deployment.refundRequestEvidenceAddress,
  }
  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2))
  console.log(`\nSaved to ${CONTEXT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
