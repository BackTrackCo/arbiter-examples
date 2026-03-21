import { createMerchantClient, createPayerClient } from '@x402r/sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID } from '../config.js'
import { klerosActions, createPinataUploader } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 2: Submit structured evidence via klerosActions plugin
// ---------------------------------------------------------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  const { paymentInfo, ...addresses } = loadContext()
  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport,
  })

  const clientConfig = {
    publicClient,
    walletClient: createWalletClient({ account, chain: arbitrumSepolia, transport }),
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
    refundRequestAddress: addresses.refundRequestAddress,
    refundRequestEvidenceAddress: addresses.refundRequestEvidenceAddress,
  }

  // --- Payer submits evidence via .extend(klerosActions) ---
  console.log('1. Payer submitting structured evidence...')
  const uploader = createPinataUploader(process.env.PINATA_JWT!)
  const payer = createPayerClient(clientConfig).extend(klerosActions)

  const payerTx = await payer.kleros.submitEvidence(
    paymentInfo,
    0n,
    {
      name: 'Service Not Delivered',
      description: 'Paid 10 USDC for API access but received 500 errors on all requests.',
      fileURI: '/ipfs/QmFakeScreenshot',
    },
    uploader,
  )
  const payerReceipt = await publicClient.waitForTransactionReceipt({ hash: payerTx })
  console.log(`  Payer evidence tx: ${payerTx} (block ${payerReceipt.blockNumber})`)

  // --- Merchant submits evidence via .extend(klerosActions) ---
  console.log('\n2. Merchant submitting structured evidence...')
  const merchant = createMerchantClient(clientConfig).extend(klerosActions)

  const merchantTx = await merchant.kleros.submitEvidence(
    paymentInfo,
    0n,
    {
      name: 'Service Delivered',
      description: 'API was operational. Attached server logs showing 200 responses.',
      fileURI: '/ipfs/QmFakeServerLogs',
    },
    uploader,
  )
  const merchantReceipt = await publicClient.waitForTransactionReceipt({ hash: merchantTx })
  console.log(`  Merchant evidence tx: ${merchantTx} (block ${merchantReceipt.blockNumber})`)

  // --- Verify evidence count ---
  const count = await payer.evidence!.count(paymentInfo, 0n)
  console.log(`\nTotal evidence entries on-chain: ${count}`)

  console.log('Done! Run script 3 next.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
