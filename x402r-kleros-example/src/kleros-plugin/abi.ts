/**
 * All Kleros ABI fragments used by the plugin.
 *
 * klerosCoreAbi comes from @kleros/kleros-v2-contracts, which ships CJS in its
 * ESM entry point.  We load it via createRequire to work under "type": "module".
 * The Ruler-specific functions are not exported by the package at all, so we
 * declare those fragments manually.
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
// DisputeResolverRuler — subset we need
// ---------------------------------------------------------------------------

export const disputeResolverRulerAbi = [
  {
    inputs: [
      { name: '_arbitratorExtraData', type: 'bytes' },
      { name: '_disputeTemplate', type: 'string' },
      { name: '_disputeTemplateDataMappings', type: 'string' },
      { name: '_numberOfRulingOptions', type: 'uint256' },
    ],
    name: 'createDisputeForTemplate',
    outputs: [{ name: 'disputeID', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const
