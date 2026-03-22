import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { createRequire } from 'node:module'
import { ARBITRUM_SEPOLIA_RPC } from '../config.js'

// ---------------------------------------------------------------------------
// Deploy KlerosCoreRuler on Arb Sepolia using bytecode from npm package
// ---------------------------------------------------------------------------

// Load KlerosCoreRuler bytecode from @kleros/kleros-v2-contracts (CJS workaround)
const require = createRequire(import.meta.url)
const { KlerosCoreRuler__factory } = require('@kleros/kleros-v2-contracts') as {
  KlerosCoreRuler__factory: { bytecode: string; abi: any[] }
}

// Compiled ERC1967 proxy (from contracts/ERC1967Proxy.sol)
const PROXY_BYTECODE =
  '0x608060405234801561001057600080fd5b5060405161045438038061045483398181016040528101906100329190610190565b817f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5560008151111561010c5760008273ffffffffffffffffffffffffffffffffffffffff16826040516100869190610255565b600060405180830381855af49150503d80600081146100c1576040519150601f19603f3d011682016040523d82523d6000602084013e6100c6565b606091505b505090508061010a576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016101019061026c565b60405180910390fd5b505b50506103bf565b6000610126610121846102bd565b61028c565b90508281526020810184848401111561013e57600080fd5b610149848285610346565b509392505050565b600081519050610160816103a8565b92915050565b600082601f83011261017757600080fd5b8151610187848260208601610113565b91505092915050565b600080604083850312156101a357600080fd5b60006101b185828601610151565b925050602083015167ffffffffffffffff8111156101ce57600080fd5b6101da85828601610166565b9150509250929050565b60006101ef826102ed565b6101f981856102f8565b9350610209818560208601610346565b80840191505092915050565b6000610222600b83610303565b91507f696e6974206661696c65640000000000000000000000000000000000000000006000830152602082019050919050565b600061026182846101e4565b915081905092915050565b6000602082019050818103600083015261028581610215565b9050919050565b6000604051905081810181811067ffffffffffffffff821117156102b3576102b2610379565b5b8060405250919050565b600067ffffffffffffffff8211156102d8576102d7610379565b5b601f19601f8301169050602081019050919050565b600081519050919050565b600081905092915050565b600082825260208201905092915050565b600061031f82610326565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60005b83811015610364578082015181840152602081019050610349565b83811115610373576000848401525b50505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6103b181610314565b81146103bc57600080fd5b50565b6087806103cd6000396000f3fe608060405236600a57005b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc543660008037600080366000845af43d6000803e8060008114604c573d6000f35b3d6000fdfea2646970667358221220d640581c934b9ff0e05007d0c3cae41779693e987d3cf5323b701ba25ca634cd64736f6c63430008000033' as `0x${string}`

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('PRIVATE_KEY env var required')

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

  console.log(`Wallet: ${account.address}`)
  console.log(`Chain:  Arbitrum Sepolia`)

  // --- 1. Deploy KlerosCoreRuler implementation ---
  console.log('\n1. Deploying KlerosCoreRuler implementation...')
  const implTx = await walletClient.sendTransaction({
    data: KlerosCoreRuler__factory.bytecode as `0x${string}`,
    account,
    chain: arbitrumSepolia,
  })
  const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implTx })
  const implAddress = implReceipt.contractAddress!
  console.log(`   Implementation: ${implAddress}`)

  // --- 2. Encode initialize calldata ---
  // initialize(address _governor, address _pinakion, uint256[4] _courtParameters)
  // courtParameters: [minStake, alpha, feeForJuror, jurorsForCourtJump]
  // Use small feeForJuror for testnet (0.0001 ETH = 100000000000000 wei)
  const initData = encodeFunctionData({
    abi: KlerosCoreRuler__factory.abi,
    functionName: 'initialize',
    args: [
      account.address,                            // governor = deployer
      '0x34B944D42cAcfC8266955D07A80181D2054aa225', // PNK on Arb Sepolia
      [
        1500000000000000000n,  // minStake: 1.5 PNK
        5000n,                  // alpha: 50%
        100000000000000n,       // feeForJuror: 0.0001 ETH
        511n,                   // jurorsForCourtJump
      ],
    ],
  })

  // --- 3. Deploy ERC1967 proxy with initialize ---
  console.log('\n2. Deploying ERC1967 proxy + initializing...')
  // Proxy constructor takes (address implementation, bytes data)
  // Constructor args are ABI-encoded and appended to bytecode
  const { encodeAbiParameters } = await import('viem')
  const encodedArgs = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }],
    [implAddress, initData],
  )

  const proxyBytecode = (PROXY_BYTECODE + encodedArgs.slice(2)) as `0x${string}`
  const proxyTx = await walletClient.sendTransaction({
    data: proxyBytecode,
    account,
    chain: arbitrumSepolia,
  })
  const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyTx })
  const proxyAddress = proxyReceipt.contractAddress!
  console.log(`   Proxy (KlerosCoreRuler): ${proxyAddress}`)

  // --- 4. Verify deployment ---
  console.log('\n3. Verifying...')

  // Check arbitrationCost
  const extraData = '0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003'
  const cost = await publicClient.readContract({
    address: proxyAddress,
    abi: KlerosCoreRuler__factory.abi,
    functionName: 'arbitrationCost',
    args: [extraData],
  })
  console.log(`   Arbitration cost (3 jurors): ${cost} wei (${Number(cost) / 1e18} ETH)`)

  // Verify changeRulingModeToManual selector exists
  const sel = keccak256(toHex('changeRulingModeToManual(address)')).slice(0, 10)
  const code = await publicClient.getCode({ address: proxyAddress })
  // Proxy delegates to impl, so we check impl
  const implCode = await publicClient.getCode({ address: implAddress })
  console.log(`   changeRulingModeToManual in impl: ${implCode!.includes(sel.slice(2))}`)

  console.log(`\n=== KlerosCoreRuler deployed! ===`)
  console.log(`Update KLEROS.klerosCoreRuler in src/config.ts to: '${proxyAddress}'`)
  console.log(`Arbitration cost per juror: 0.0001 ETH`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
