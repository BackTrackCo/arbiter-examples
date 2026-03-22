import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { ARBITRUM_SEPOLIA_RPC, KLEROS } from '../config.js'
import { loadContext } from './shared.js'

// ---------------------------------------------------------------------------
// Script 3b: Give ruling on KlerosCoreRuler
//
// We deployed our own KlerosCoreRuler on Arb Sepolia (Kleros hasn't deployed
// the Ruler on testnet yet). The Ruler UI is hardcoded to Kleros's address,
// so we give the ruling programmatically instead.
//
// Once Kleros deploys the official KlerosCoreRuler on Arb Sepolia, this
// script can be replaced by using the Ruler UI.
// ---------------------------------------------------------------------------

const klerosRulerAbi = [
  {
    inputs: [
      { name: '_disputeID', type: 'uint256' },
      { name: '_ruling', type: 'uint256' },
      { name: 'tied', type: 'bool' },
      { name: 'overridden', type: 'bool' },
    ],
    name: 'executeRuling',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')

  const { arbitratorDisputeID: rawID } = loadContext()
  if (rawID === undefined) throw new Error('No dispute ID in context — run script 3 first')
  const disputeID = BigInt(rawID)

  // Parse ruling from CLI args (default: 1 = Payer Wins)
  const rulingArg = process.argv[2] ? parseInt(process.argv[2]) : 1
  if (rulingArg < 1 || rulingArg > 2) {
    console.log('Usage: pnpm run give-ruling [1|2]')
    console.log('  1 = Payer Wins (Refund)')
    console.log('  2 = Receiver Wins (No Refund)')
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

  const rulingLabel = rulingArg === 1 ? 'Payer Wins (Refund)' : 'Receiver Wins (No Refund)'
  console.log(`Giving ruling on dispute ${disputeID}: ${rulingArg} — ${rulingLabel}`)

  const { request } = await publicClient.simulateContract({
    account,
    address: KLEROS.klerosCoreRuler,
    abi: klerosRulerAbi,
    functionName: 'executeRuling',
    args: [disputeID, BigInt(rulingArg), false, false],
  })
  const tx = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
  console.log(`Ruling given! tx: ${tx} (block ${receipt.blockNumber})`)
  console.log('\nRun: pnpm run ruling')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
