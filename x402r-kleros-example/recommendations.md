# Kleros Integration Recommendations

Actionable recommendations for the Kleros team based on real integration experience building x402r + Kleros arbitration on Arbitrum Sepolia.

## 1. Deploy KlerosCoreRuler and DisputeResolverRuler on testnets

KlerosCoreRuler and DisputeResolverRuler are deployed on Arbitrum mainnet but not on any testnet. The address provided as the "Ruler" on Arb Sepolia (`0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9`) is actually a regular KlerosCore -- we verified by checking the implementation bytecode behind the proxy. It has `governor()`, `passPeriod()`, `draw()`, dispute kits, etc. but none of the Ruler-specific functions (`changeRulingModeToManual`, `rulers`, 4-param `executeRuling`).

We deployed both contracts ourselves using the bytecode from `@kleros/kleros-v2-contracts`, but official testnet deployments would mean:

- The Ruler UI works out of the box (it's hardcoded to Kleros's addresses)
- Developers don't need to deploy infrastructure just to test
- Testnet addresses can be exported from the npm package

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
