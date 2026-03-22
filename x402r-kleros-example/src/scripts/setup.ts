import { deployMarketplaceOperator } from '@x402r/core'
import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync } from 'node:fs'
import {
  ARBITRUM_SEPOLIA_RPC,
  CHAIN_ID,
  CONTEXT_FILE,
} from '../config.js'

// ---------------------------------------------------------------------------
// Setup: Deploy marketplace operator (one-time)
// ---------------------------------------------------------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

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
