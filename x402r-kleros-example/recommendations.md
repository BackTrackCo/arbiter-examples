# Kleros Integration Recommendations

Actionable recommendations for the Kleros team based on real integration experience building x402r + Kleros arbitration on Arbitrum Sepolia. These are specific changes that would eliminate our workarounds entirely.

## 1. Deploy KlerosCoreRuler and DisputeResolverRuler on testnets

KlerosCoreRuler is deployed on Arbitrum mainnet (`0xc0169e...`) but not on any testnet. The address provided as the "Ruler" on Arb Sepolia (`0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9`) is actually a regular KlerosCore -- we verified by checking the implementation bytecode behind the proxy. It has `governor()`, `passPeriod()`, `draw()`, dispute kits, etc. but none of the Ruler-specific functions (`changeRulingModeToManual`, `rulers`, 4-param `executeRuling`).

We deployed our own KlerosCoreRuler on Arb Sepolia using the bytecode from `@kleros/kleros-v2-contracts` (`KlerosCoreRuler__factory`). It works, but the Ruler UI is hardcoded to Kleros's address so we have to give rulings programmatically.

Deploying a [DisputeResolverRuler](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/devtools/DisputeResolverRuler.sol) alongside it would:

- **Eliminate the need for ToyArbitrable entirely** (DisputeResolver implements `rule()`)
- **Match the production architecture** (DisputeResolver -> KlerosCore)
- Let developers test dispute templates and EvidenceModule integration with instant rulings
- Make the testnet experience identical to production except rulings are instant

## 2. Fix ESM packaging in `@kleros/kleros-v2-contracts`

The `esm/` directory ships CJS code (`Object.defineProperty(exports, ...)`). Any project with `"type": "module"` can't import the package. We had to use `createRequire` as a workaround:

```typescript
// What we wanted:
import { testnetViem } from '@kleros/kleros-v2-contracts'

// What we had to do:
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { testnetViem } = require('@kleros/kleros-v2-contracts')
```

This is the #1 blocker for modern TypeScript adoption.

## 3. Export KlerosCoreRuler ABI and addresses in viem format

The Ruler ABI is only accessible via ethers factory exports (`KlerosCoreRuler__factory`). The `testnetViem` export has `klerosCoreAbi` (which shares some functions via KlerosCoreBase) but not Ruler-specific functions like `changeRulingModeToManual`, `executeRuling(4 params)`, or `rulers`. Viem is the standard for modern onchain development -- Ruler should be a first-class export.

We had to define the Ruler ABI manually:

```typescript
const klerosRulerAbi = [
  {
    inputs: [{ name: '_arbitrable', type: 'address' }],
    name: 'changeRulingModeToManual',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
```

## 4. Default ruling mode to manual (or don't revert on uninitialized)

`_autoRule()` reverts with `RulingModeNotSet` if the ruling mode is uninitialized. This means you MUST call `changeRulingModeToManual()` before creating any dispute -- a non-obvious prerequisite.

Two possible fixes:

- Default to manual mode (the Ruler is a dev tool -- manual is the expected default)
- Don't revert on uninitialized -- treat it like manual (skip auto-ruling)

## 5. Provide an `encodeExtraData` helper

`extraData` is `abi.encode(uint96 courtId, uint256 minJurors)` but this isn't documented anywhere. Passing `0x` works for `arbitrationCost()` but fails for `createDispute()`. A simple exported helper would prevent this confusion:

```typescript
import { encodeExtraData } from '@kleros/kleros-v2-contracts'
const extraData = encodeExtraData({ courtId: 1, minJurors: 3 })
```

## 6. Ruler UI: allow custom arbitrator address

The Ruler UI is hardcoded to a specific KlerosCoreRuler address per chain. Since we had to deploy our own Ruler on Arb Sepolia, the UI is unusable. Adding an input field to override the arbitrator address would let developers use the UI with self-deployed Rulers.

## Impact

If Kleros deploys KlerosCoreRuler + DisputeResolverRuler on testnets:

- Our `deploy-ruler.ts` script becomes unnecessary
- ToyArbitrable and its deployment become unnecessary (DisputeResolver handles `rule()` callback)
- The Ruler UI works out of the box
- The `give-ruling` script becomes optional (can use UI instead)

The integration would need **zero contract deployments**, match the production architecture exactly, and shrink from ~100 lines of workarounds to ~10 lines of plugin config.
