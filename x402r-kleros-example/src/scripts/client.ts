import {
  signReceiveAuthorization,
  type PaymentInfo,
} from '@x402r/core'
import { createMerchantClient, createPayerClient } from '@x402r/sdk'
import { erc20Abi } from 'viem'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  CONTEXT_FILE,
  FAR_FUTURE,
  KLEROS,
  PAYMENT_AMOUNT,
  USDC,
  CHAIN_ID,
} from '../config.js'
import { klerosActions } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext, serializePaymentInfo } from './shared.js'

// ---------------------------------------------------------------------------
// Client: Make payment, request refund, submit evidence, create dispute
// ---------------------------------------------------------------------------

async function main() {
  const clients = createClients()
  const { account, publicClient } = clients
  const addresses = loadContext()
  const sdkConfig = x402rConfig(addresses, clients)
  const kConfig = klerosConfig()

  // --- Check balance ---
  const usdcBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log(`USDC balance: ${usdcBalance} (need ${PAYMENT_AMOUNT})`)
  if (usdcBalance < PAYMENT_AMOUNT) {
    throw new Error('Insufficient USDC')
  }

  // --- 1. Authorize payment ---
  const paymentInfo: PaymentInfo = {
    operator: addresses.operatorAddress,
    payer: account.address,
    receiver: account.address,
    token: USDC,
    maxAmount: PAYMENT_AMOUNT,
    preApprovalExpiry: FAR_FUTURE,
    authorizationExpiry: FAR_FUTURE,
    refundExpiry: FAR_FUTURE,
    minFeeBps: 0,
    maxFeeBps: 500,
    feeReceiver: addresses.operatorAddress,
    salt: BigInt(Date.now()),
  }

  console.log('\n1. Authorizing payment...')
  const { collectorData, tokenCollector } = await signReceiveAuthorization({
    account,
    chainId: CHAIN_ID,
    paymentInfo,
    tokenName: 'USD Coin',
  })

  const merchant = createMerchantClient(sdkConfig).extend(klerosActions(kConfig))
  const authTx = await merchant.payment.authorize(
    paymentInfo,
    PAYMENT_AMOUNT,
    tokenCollector,
    collectorData,
  )
  await publicClient.waitForTransactionReceipt({ hash: authTx })
  console.log(`  tx: ${authTx}`)

  // --- 2. Dispute refund (request + evidence + Kleros dispute) ---
  console.log('\n2. Disputing refund...')
  const payer = createPayerClient(sdkConfig).extend(klerosActions(kConfig))
  const result = await payer.kleros.disputeRefund(paymentInfo, PAYMENT_AMOUNT, 0n, {
    name: 'Service Not Delivered',
    description: 'Paid for API access but received 500 errors on all requests.',
  })
  console.log(`  Refund request tx: ${result.requestTxHash}`)
  console.log(`  Evidence tx:       ${result.evidenceTxHash}`)
  console.log(`  Dispute ID:        ${result.dispute.disputeID}`)
  console.log(`  Dispute tx:        ${result.dispute.txHash}`)

  // --- 3. Merchant submits counter-evidence ---
  console.log('\n3. Merchant submitting counter-evidence...')
  const merchantEvidenceTx = await merchant.kleros.submitEvidence(paymentInfo, 0n, {
    name: 'Service Delivered',
    description: 'API was operational. Attached server logs showing 200 responses.',
  })
  await publicClient.waitForTransactionReceipt({ hash: merchantEvidenceTx })
  console.log(`  tx: ${merchantEvidenceTx}`)

  // --- Save context ---
  const existing = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  existing.paymentInfo = serializePaymentInfo(paymentInfo)
  existing.arbitratorAddress = KLEROS.klerosCoreRuler
  existing.arbitratorDisputeID = result.dispute.disputeID.toString()
  writeFileSync(CONTEXT_FILE, JSON.stringify(existing, null, 2))

  console.log('\nDone. Run: pnpm run arbiter 1')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
