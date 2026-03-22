import {
  signReceiveAuthorization,
  type PaymentInfo,
} from '@x402r/core'
import { createMerchantClient, createPayerClient } from '@x402r/sdk'
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  ARBITRUM_SEPOLIA_RPC,
  CHAIN_ID,
  CONTEXT_FILE,
  FAR_FUTURE,
  KLEROS,
  PAYMENT_AMOUNT,
  USDC,
} from '../config.js'
import { klerosActions, createPinataUploader, pinataFetcher } from '../kleros-plugin/index.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Client: Make payment, request refund, submit evidence, create dispute
// ---------------------------------------------------------------------------

function serializePaymentInfo(pi: PaymentInfo) {
  return {
    operator: pi.operator,
    payer: pi.payer,
    receiver: pi.receiver,
    token: pi.token,
    maxAmount: pi.maxAmount.toString(),
    preApprovalExpiry: pi.preApprovalExpiry,
    authorizationExpiry: pi.authorizationExpiry,
    refundExpiry: pi.refundExpiry,
    minFeeBps: pi.minFeeBps,
    maxFeeBps: pi.maxFeeBps,
    feeReceiver: pi.feeReceiver,
    salt: pi.salt.toString(),
  }
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')

  const { operatorAddress, escrowPeriodAddress, refundRequestAddress, refundRequestEvidenceAddress } = loadContext()
  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

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

  const clientConfig = {
    publicClient,
    walletClient,
    operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress,
    refundRequestAddress,
    refundRequestEvidenceAddress,
  }

  const klerosConfig = {
    arbitrator: KLEROS.klerosCoreRuler,
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(process.env.PINATA_JWT!),
    ipfsFetcher: pinataFetcher,
  }

  // --- 1. Authorize payment ---
  const paymentInfo: PaymentInfo = {
    operator: operatorAddress,
    payer: account.address,
    receiver: account.address,
    token: USDC,
    maxAmount: PAYMENT_AMOUNT,
    preApprovalExpiry: FAR_FUTURE,
    authorizationExpiry: FAR_FUTURE,
    refundExpiry: FAR_FUTURE,
    minFeeBps: 0,
    maxFeeBps: 500,
    feeReceiver: operatorAddress,
    salt: BigInt(Date.now()),
  }

  console.log('\n1. Authorizing payment...')
  const { collectorData, tokenCollector } = await signReceiveAuthorization({
    account,
    chainId: CHAIN_ID,
    paymentInfo,
    tokenName: 'USD Coin',
  })

  const merchant = createMerchantClient(clientConfig).extend(klerosActions(klerosConfig))
  const authTx = await merchant.payment.authorize(
    paymentInfo,
    PAYMENT_AMOUNT,
    tokenCollector,
    collectorData,
  )
  await publicClient.waitForTransactionReceipt({ hash: authTx })
  console.log(`  tx: ${authTx}`)

  // --- 2. Request refund ---
  console.log('\n2. Requesting refund...')
  const payer = createPayerClient(clientConfig).extend(klerosActions(klerosConfig))
  const requestTx = await payer.refund!.request(paymentInfo, PAYMENT_AMOUNT, 0n)
  await publicClient.waitForTransactionReceipt({ hash: requestTx })
  console.log(`  tx: ${requestTx}`)

  // --- 3. Submit evidence ---
  console.log('\n3. Submitting evidence...')
  const payerEvidenceTx = await payer.kleros.submitEvidence(paymentInfo, 0n, {
    name: 'Service Not Delivered',
    description: 'Paid for API access but received 500 errors on all requests.',
  })
  await publicClient.waitForTransactionReceipt({ hash: payerEvidenceTx })
  console.log(`  Payer evidence tx: ${payerEvidenceTx}`)

  const merchantEvidenceTx = await merchant.kleros.submitEvidence(paymentInfo, 0n, {
    name: 'Service Delivered',
    description: 'API was operational. Attached server logs showing 200 responses.',
  })
  await publicClient.waitForTransactionReceipt({ hash: merchantEvidenceTx })
  console.log(`  Merchant evidence tx: ${merchantEvidenceTx}`)

  // --- 4. Create Kleros dispute ---
  console.log('\n4. Creating Kleros dispute...')
  const dispute = await payer.kleros.createDispute(paymentInfo, 0n)
  console.log(`  Dispute ID: ${dispute.disputeID}`)
  console.log(`  tx: ${dispute.txHash}`)

  // --- Save context ---
  const existing = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))
  existing.paymentInfo = serializePaymentInfo(paymentInfo)
  existing.arbitratorAddress = KLEROS.klerosCoreRuler
  existing.arbitratorDisputeID = dispute.disputeID.toString()
  writeFileSync(CONTEXT_FILE, JSON.stringify(existing, null, 2))

  console.log('\nDone. Run: pnpm run arbiter 1')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
