/**
 * All Kleros + ArbitrableX402r ABI fragments used by the plugin.
 *
 * klerosCoreAbi comes from @kleros/kleros-v2-contracts, which ships CJS in its
 * ESM entry point.  We load it via createRequire to work under "type": "module".
 * The Ruler-specific functions are not exported by the package, so we declare
 * those fragments manually.
 *
 * arbitrableX402rAbi + bytecode are generated from the local Foundry build
 * artifact by `pnpm run generate:abi` (see scripts/generate-abi.ts).
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { testnetViem } = require('@kleros/kleros-v2-contracts') as {
  testnetViem: typeof import('@kleros/kleros-v2-contracts').testnetViem
}

// ---------------------------------------------------------------------------
// KlerosCore — from npm package (arbitrationCost, currentRuling, events, etc.)
// ---------------------------------------------------------------------------

export const klerosCoreAbi = testnetViem.klerosCoreAbi

// ---------------------------------------------------------------------------
// KlerosCoreRuler — not exported by the package
// ---------------------------------------------------------------------------

export const klerosRulerAbi = [
  {
    inputs: [{ name: '_arbitrable', type: 'address' }],
    name: 'changeRulingModeToManual',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const klerosRulerExecuteAbi = [
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

// ---------------------------------------------------------------------------
// ArbitrableX402r — generated from Foundry artifact (do not edit manually)
// ---------------------------------------------------------------------------

export { arbitrableX402rAbi, arbitrableX402rBytecode } from './generated.js'
