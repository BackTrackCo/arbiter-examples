import type { Address } from 'viem'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { existsSync, readFileSync } from 'node:fs'
import { ARBITRUM_SEPOLIA_RPC, CHAIN_ID, CONTEXT_FILE, KLEROS } from '../config.js'
import { createPinataUploader, pinataFetcher, type KlerosConfig } from '../kleros-plugin/index.js'

// ---------------------------------------------------------------------------
// Viem clients
// ---------------------------------------------------------------------------

export function createClients() {
  const raw = process.env.PRIVATE_KEY
  if (!raw) throw new Error('PRIVATE_KEY env var required')
  if (!raw.startsWith('0x')) throw new Error('PRIVATE_KEY must be 0x-prefixed hex')
  const privateKey = raw as `0x${string}`

  const account = privateKeyToAccount(privateKey)
  const transport = http(ARBITRUM_SEPOLIA_RPC)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport })

  return { account, publicClient, walletClient }
}

// ---------------------------------------------------------------------------
// Kleros config
// ---------------------------------------------------------------------------

export function klerosConfig(
  arbitrableX402rAddress: Address,
  options?: { withIpfs?: boolean },
): KlerosConfig {
  const config: KlerosConfig = {
    arbitrator: KLEROS.klerosCoreRuler,
    arbitrableX402r: arbitrableX402rAddress,
    extraData: KLEROS.extraData,
  }

  if (options?.withIpfs !== false) {
    if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT env var required')
    config.ipfsUploader = createPinataUploader(process.env.PINATA_JWT)
    config.ipfsFetcher = pinataFetcher
  }

  return config
}

// ---------------------------------------------------------------------------
// x402r SDK config
// ---------------------------------------------------------------------------

export function x402rConfig(
  addresses: Pick<DeploymentContext, 'operatorAddress' | 'escrowPeriodAddress' | 'refundRequestAddress'>,
  clients: ReturnType<typeof createClients>,
) {
  return {
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    operatorAddress: addresses.operatorAddress,
    chainId: CHAIN_ID,
    escrowPeriodAddress: addresses.escrowPeriodAddress,
    refundRequestAddress: addresses.refundRequestAddress,
  }
}

// ---------------------------------------------------------------------------
// Deployment context (written by setup, read by all scripts)
// ---------------------------------------------------------------------------

export interface DeploymentContext {
  arbitrableX402rAddress: Address
  operatorAddress: Address
  escrowPeriodAddress: Address
  refundRequestAddress: Address
}

export function loadContext(): DeploymentContext {
  if (!existsSync(CONTEXT_FILE)) {
    throw new Error(`${CONTEXT_FILE} not found — run pnpm run setup first`)
  }

  const raw = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'))

  return {
    arbitrableX402rAddress: raw.arbitrableX402rAddress,
    operatorAddress: raw.operatorAddress,
    escrowPeriodAddress: raw.escrowPeriodAddress,
    refundRequestAddress: raw.refundRequestAddress,
  }
}
