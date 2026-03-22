import { deployMarketplaceOperator } from '@x402r/core'
import { encodeAbiParameters } from 'viem'
import { writeFileSync } from 'node:fs'
import { CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { arbitrableX402rAbi, arbitrableX402rBytecode, klerosRulerAbi } from '../kleros-plugin/abi.js'
import { createClients } from './shared.js'

// ---------------------------------------------------------------------------
// Setup: Deploy ArbitrableX402r + marketplace operator (one-time)
//
// 1. Deploy ArbitrableX402r(klerosCoreRuler)
// 2. changeRulingModeToManual(ArbitrableX402r) on Ruler
// 3. deployMarketplaceOperator(arbiter: ArbitrableX402r)
// ---------------------------------------------------------------------------

async function main() {
  const { account, publicClient, walletClient } = createClients()

  console.log(`Wallet: ${account.address}`)
  console.log(`Chain:  Arbitrum Sepolia (${CHAIN_ID})`)

  // --- 1. Deploy ArbitrableX402r ---
  console.log('\n1. Deploying ArbitrableX402r...')
  const constructorArgs = encodeAbiParameters(
    [{ type: 'address' }],
    [KLEROS.klerosCoreRuler],
  )
  const deployData = (arbitrableX402rBytecode + constructorArgs.slice(2)) as `0x${string}`
  const deployTx = await walletClient.sendTransaction({
    data: deployData,
    account,
    chain: walletClient.chain,
  })
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployTx })
  const arbitrableX402rAddress = deployReceipt.contractAddress!
  console.log(`  ArbitrableX402r: ${arbitrableX402rAddress}`)

  // --- 2. Set ruling mode to manual on Ruler ---
  console.log('\n2. Setting ruling mode to manual...')
  const { request: manualReq } = await publicClient.simulateContract({
    account,
    address: KLEROS.klerosCoreRuler,
    abi: klerosRulerAbi,
    functionName: 'changeRulingModeToManual',
    args: [arbitrableX402rAddress],
  })
  const manualTx = await walletClient.writeContract(manualReq)
  await publicClient.waitForTransactionReceipt({ hash: manualTx })
  console.log(`  tx: ${manualTx}`)

  // Verify ARBITRATOR
  const arbitrator = await publicClient.readContract({
    address: arbitrableX402rAddress,
    abi: arbitrableX402rAbi,
    functionName: 'ARBITRATOR',
  })
  console.log(`  ARBITRATOR: ${arbitrator}`)

  // --- 3. Deploy marketplace operator with ArbitrableX402r as arbiter ---
  console.log('\n3. Deploying marketplace operator...')
  const deployment = await deployMarketplaceOperator(
    walletClient,
    publicClient,
    {
      chainId: CHAIN_ID,
      feeRecipient: account.address,
      arbiter: arbitrableX402rAddress,
      escrowPeriodSeconds: 300n,
      operatorFeeBps: 50n,
    },
  )

  console.log(`  Operator:       ${deployment.operatorAddress}`)
  console.log(`  EscrowPeriod:   ${deployment.escrowPeriodAddress}`)
  console.log(`  RefundRequest:  ${deployment.refundRequestAddress}`)
  console.log(`  RefundEvidence: ${deployment.refundRequestEvidenceAddress}`)
  console.log(`  New: ${deployment.summary.newCount}, existing: ${deployment.summary.existingCount}`)

  // --- Save context ---
  const context = {
    arbitrableX402rAddress,
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
