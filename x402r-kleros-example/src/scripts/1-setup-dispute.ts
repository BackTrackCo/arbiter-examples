import {
  deployMarketplaceOperator,
  signReceiveAuthorization,
  type PaymentInfo,
} from '@x402r/core'
import { createMerchantClient, createPayerClient } from '@x402r/sdk'
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { writeFileSync } from 'node:fs'
import {
  ARBITRUM_SEPOLIA_RPC,
  CHAIN_ID,
  CONTEXT_FILE,
  FAR_FUTURE,
  PAYMENT_AMOUNT,
  USDC,
} from '../config.js'

// ---------------------------------------------------------------------------
// Script 1: Deploy operator, authorize payment, request refund
// ---------------------------------------------------------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport,
  })
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport,
  })

  console.log(`Wallet: ${account.address}`)
  console.log(`Chain:  Arbitrum Sepolia (${CHAIN_ID})`)

  // --- Check USDC balance ---
  const usdcBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log(`USDC balance: ${usdcBalance} (need ${PAYMENT_AMOUNT})`)
  if (usdcBalance < PAYMENT_AMOUNT) {
    throw new Error('Insufficient USDC — fund wallet first')
  }

  // --- Deploy marketplace operator ---
  console.log('\n1. Deploying marketplace operator...')
  const deployment = await deployMarketplaceOperator(
    walletClient,
    publicClient,
    {
      chainId: CHAIN_ID,
      feeRecipient: account.address,
      arbiter: account.address, // self-arbiter for demo
      escrowPeriodSeconds: 300n, // 5 min escrow (short for demo)
      operatorFeeBps: 50n,
    },
  )

  console.log(`  Operator:        ${deployment.operatorAddress}`)
  console.log(`  EscrowPeriod:    ${deployment.escrowPeriodAddress}`)
  console.log(`  RefundRequest:   ${deployment.refundRequestAddress}`)
  console.log(`  RefundEvidence:  ${deployment.refundRequestEvidenceAddress}`)
  console.log(`  New deploys: ${deployment.summary.newCount}, existing: ${deployment.summary.existingCount}`)

  // --- Build PaymentInfo ---
  // For the demo, payer = receiver = arbiter = same wallet (self-contained)
  // In production these would be different addresses
  const receiver = account.address
  const paymentInfo: PaymentInfo = {
    operator: deployment.operatorAddress,
    payer: account.address,
    receiver,
    token: USDC,
    maxAmount: PAYMENT_AMOUNT,
    preApprovalExpiry: FAR_FUTURE,
    authorizationExpiry: FAR_FUTURE,
    refundExpiry: FAR_FUTURE,
    minFeeBps: 0,
    maxFeeBps: 500,
    feeReceiver: deployment.operatorAddress,
    salt: BigInt(Date.now()),
  }

  // --- Authorize payment via ERC-3009 ---
  console.log('\n2. Authorizing payment...')
  const { collectorData, tokenCollector } = await signReceiveAuthorization({
    account,
    chainId: CHAIN_ID,
    paymentInfo,
    tokenName: 'USD Coin', // Arb Sepolia USDC uses "USD Coin" in EIP-712 domain
  })

  const merchantClient = createMerchantClient({
    publicClient,
    walletClient,
    operatorAddress: deployment.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: deployment.escrowPeriodAddress,
    refundRequestAddress: deployment.refundRequestAddress,
    refundRequestEvidenceAddress: deployment.refundRequestEvidenceAddress,
  })

  const authTx = await merchantClient.payment.authorize(
    paymentInfo,
    PAYMENT_AMOUNT,
    tokenCollector,
    collectorData,
  )
  const authReceipt = await publicClient.waitForTransactionReceipt({ hash: authTx })
  console.log(`  Auth tx: ${authTx} (block ${authReceipt.blockNumber})`)

  // --- Request refund ---
  console.log('\n3. Requesting refund...')
  const payerClient = createPayerClient({
    publicClient,
    walletClient,
    operatorAddress: deployment.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: deployment.escrowPeriodAddress,
    refundRequestAddress: deployment.refundRequestAddress,
    refundRequestEvidenceAddress: deployment.refundRequestEvidenceAddress,
  })

  const requestTx = await payerClient.refund!.request(paymentInfo, PAYMENT_AMOUNT, 0n)
  const requestReceipt = await publicClient.waitForTransactionReceipt({ hash: requestTx })
  console.log(`  Refund request tx: ${requestTx} (block ${requestReceipt.blockNumber})`)

  const refundData = await payerClient.refund!.get(paymentInfo, 0n)
  console.log(`  Refund status: ${refundData.status} (0 = Pending)`)

  // --- Save context ---
  const context = {
    operatorAddress: deployment.operatorAddress,
    escrowPeriodAddress: deployment.escrowPeriodAddress,
    refundRequestAddress: deployment.refundRequestAddress,
    refundRequestEvidenceAddress: deployment.refundRequestEvidenceAddress,
    paymentInfo: serializePaymentInfo(paymentInfo),
  }
  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2))
  console.log(`\nContext saved to ${CONTEXT_FILE}`)
  console.log('Done! Run script 2 next.')
}

function serializePaymentInfo(pi: PaymentInfo) {
  return {
    operator: pi.operator,
    payer: pi.payer,
    receiver: pi.receiver,
    token: pi.token,
    maxAmount: pi.maxAmount.toString(), // bigint → string
    preApprovalExpiry: pi.preApprovalExpiry, // number (uint48)
    authorizationExpiry: pi.authorizationExpiry, // number (uint48)
    refundExpiry: pi.refundExpiry, // number (uint48)
    minFeeBps: pi.minFeeBps,
    maxFeeBps: pi.maxFeeBps,
    feeReceiver: pi.feeReceiver,
    salt: pi.salt.toString(), // bigint → string
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
