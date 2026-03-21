# Kleros Integration Recommendations

Actionable recommendations for the Kleros team based on real integration experience building x402r + Kleros arbitration on Arbitrum Sepolia. These are specific changes that would eliminate our workarounds entirely.

## 1. Fix ESM packaging in `@kleros/kleros-v2-contracts`

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

## 2. Export KlerosCoreRuler ABI and addresses in viem format

The Ruler ABI is only accessible via ethers factory exports (`KlerosCoreRuler__factory`). The `testnetViem` export has `klerosCoreAbi` (which shares some functions via KlerosCoreBase) but not Ruler-specific functions like `changeRulingModeToManual`, `executeRuling(4 params)`, or `rulers`. Viem is the standard for modern onchain development — Ruler should be a first-class export.

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

## 3. Deploy a DisputeResolver connected to KlerosCoreRuler on testnets

The existing testnet DisputeResolver (`0xed31...`) points to regular KlerosCore (with juror voting). There's no DisputeResolver connected to the KlerosCoreRuler. This means developers can't test the full DisputeResolver + Ruler flow — they must either go directly to the Ruler (requiring a custom arbitrable contract) or use the real KlerosCore (waiting days for juror voting).

Deploy a `DisputeResolver` that points to KlerosCoreRuler on each testnet and export its address from the contracts package. This would:

- **Eliminate the need for ToyArbitrable entirely** (DisputeResolver implements `rule()`)
- **Match the production architecture** (DisputeResolver → KlerosCore)
- Let developers test dispute templates and EvidenceModule integration with instant rulings
- Make the testnet experience identical to production except rulings are instant

## 4. Default ruling mode to manual (or don't revert on uninitialized)

`_autoRule()` reverts with `RulingModeNotSet` if the ruling mode is uninitialized. This means you MUST call `changeRulingModeToManual()` before creating any dispute — a non-obvious prerequisite that caused us to incorrectly blame "governor access" for our failures.

Two possible fixes:

- Default to manual mode (the Ruler is a dev tool — manual is the expected default)
- Don't revert on uninitialized — treat it like manual (skip auto-ruling)

## 5. Provide an `encodeExtraData` helper

`extraData` is `abi.encode(uint96 courtId, uint256 minJurors)` but this isn't documented anywhere. Passing `0x` works for `arbitrationCost()` but fails for `createDispute()`. A simple exported helper would prevent this confusion:

```typescript
import { encodeExtraData } from '@kleros/kleros-v2-contracts'
const extraData = encodeExtraData({ courtId: 1, minJurors: 3 })
```

## 6. Ruler UI: add guided flow

The UI shows raw input fields but doesn't explain the prerequisite steps. A wizard or at minimum inline help text would prevent the exact failure we hit:

- Step 1: Enter your arbitrable contract address
- Step 2: Set ruling mode (must be done before creating disputes)
- Step 3: Create dispute (via your own code)
- Step 4: Give ruling

## Impact

If Kleros implements these recommendations:

- Our entire `kleros-contracts.ts` workaround file (createRequire hack) becomes a clean import
- ToyArbitrable deployment and ruling mode initialization become unnecessary (DisputeResolver handles rule() callback)
- Manual ABI definitions for Ruler-specific functions are replaced by package exports
- extraData encoding is a documented helper call instead of guesswork

The integration would need **zero contract deployments**, match the production architecture exactly, and shrink from ~100 lines of workarounds to ~10 lines of plugin config.
