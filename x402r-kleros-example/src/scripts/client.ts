import {
  signReceiveAuthorization,
  type PaymentInfo,
} from '@x402r/core'
import { createMerchantClient, createPayerClient } from '@x402r/sdk'
import { erc20Abi } from 'viem'
import {
  FAR_FUTURE,
  PAYMENT_AMOUNT,
  USDC,
  CHAIN_ID,
} from '../config.js'
import { klerosActions } from '../kleros-plugin/index.js'
import { createClients, klerosConfig, x402rConfig, loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Payer: Sign authorization, make payment, dispute refund
//
// 1. Payer signs authorization, merchant submits on-chain
//    (same wallet in demo — in production these are separate parties)
// 2. Payer calls kleros.request() — one SDK call that bundles:
//    refund request + Kleros dispute + dual evidence
// ---------------------------------------------------------------------------

async function main() {
  const clients = createClients()
  const { account, publicClient } = clients
  const ctx = loadContext()
  const sdkConfig = x402rConfig(ctx, clients)
  const kConfig = klerosConfig(ctx.arbitrableX402rAddress)

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

  // --- 1. Payer signs authorization ---
  const paymentInfo: PaymentInfo = {
    operator: ctx.operatorAddress,
    payer: account.address,
    receiver: account.address,
    token: USDC,
    maxAmount: PAYMENT_AMOUNT,
    preApprovalExpiry: FAR_FUTURE,
    authorizationExpiry: FAR_FUTURE,
    refundExpiry: FAR_FUTURE,
    minFeeBps: 0,
    maxFeeBps: 500,
    feeReceiver: ctx.operatorAddress,
    salt: BigInt(Date.now()),
  }

  console.log('\n1. Payer signing authorization...')
  const { collectorData, tokenCollector } = await signReceiveAuthorization({
    account,
    chainId: CHAIN_ID,
    paymentInfo,
    tokenName: 'USD Coin',
  })

  // Merchant submits the payer's signed authorization on-chain
  const merchant = createMerchantClient(sdkConfig)
  const authTx = await merchant.payment.authorize(
    paymentInfo,
    PAYMENT_AMOUNT,
    tokenCollector,
    collectorData,
  )
  await publicClient.waitForTransactionReceipt({ hash: authTx })
  console.log(`  tx: ${authTx}`)

  // --- 2. Payer disputes refund via kleros.request() ---
  console.log('\n2. Payer disputing refund...')
  const payer = createPayerClient(sdkConfig).extend(klerosActions(kConfig))
  const result = await payer.kleros.request(paymentInfo, PAYMENT_AMOUNT, {
    name: 'Service Not Delivered',
    description: 'Paid for API access but received 500 errors on all requests.',
  })
  console.log(`  Refund request tx:   ${result.requestTxHash}`)
  console.log(`  Arbitrator dispute:  ${result.dispute.arbitratorDisputeID}`)
  console.log(`  Local dispute:       ${result.dispute.localDisputeID}`)
  console.log(`  Dispute tx:          ${result.dispute.txHash}`)
  if (result.evidenceTxHash) {
    console.log(`  Evidence tx:         ${result.evidenceTxHash}`)
  }

  console.log('\nDone. Run: pnpm run merchant')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
