import type { Address, PublicClient, WalletClient } from 'viem'

// ---------------------------------------------------------------------------
// ToyArbitrable — compiled from contracts/ToyArbitrable.sol (solc 0.8.0)
// ---------------------------------------------------------------------------

export const toyArbitrableAbi = [
  {
    inputs: [
      { name: 'arbitrator', type: 'address' },
      { name: 'choices', type: 'uint256' },
      { name: 'extraData', type: 'bytes' },
    ],
    name: 'createDispute',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    name: 'rule',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const toyArbitrableBytecode =
  '0x608060405234801561001057600080fd5b50610248806100206000396000f3fe6080604052600436106100295760003560e01c8063057bd5081461002e578063311a6c5614610057575b600080fd5b61004161003c36600461010b565b610079565b60405161004e91906101d3565b60405180910390f35b34801561006357600080fd5b506100776100723660046101b2565b610107565b005b6000846001600160a01b031663c13517e1348686866040518563ffffffff1660e01b81526004016100ac939291906101dc565b6020604051808303818588803b1580156100c557600080fd5b505af11580156100d9573d6000803e3d6000fd5b50505050506040513d601f19601f820116820180604052508101906100fe919061019a565b95945050505050565b5050565b60008060008060608587031215610120578384fd5b84356001600160a01b0381168114610136578485fd5b935060208501359250604085013567ffffffffffffffff80821115610159578384fd5b818701915087601f83011261016c578384fd5b81358181111561017a578485fd5b88602082850101111561018b578485fd5b95989497505060200194505050565b6000602082840312156101ab578081fd5b5051919050565b600080604083850312156101c4578182fd5b50508035926020909101359150565b90815260200190565b60008482526040602083015282604083015282846060840137818301606090810191909152601f909201601f191601019291505056fea264697066735822122070b83c5d8391073c102f86129865013328742d13bc3a82c4a4ae6705806ae03f64736f6c63430008000033' as `0x${string}`

// ---------------------------------------------------------------------------
// Deploy helper
// ---------------------------------------------------------------------------

export async function deployToyArbitrable(
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<Address> {
  const hash = await walletClient.sendTransaction({
    data: toyArbitrableBytecode,
    account: walletClient.account!,
    chain: walletClient.chain,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) {
    throw new Error('ToyArbitrable deployment failed — no contract address in receipt')
  }
  return receipt.contractAddress
}
