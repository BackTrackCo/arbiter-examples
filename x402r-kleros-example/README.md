# x402r + Kleros Arbitration Example

Example showing how to integrate [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

**Chain:** Arbitrum Sepolia (421614)

## Architecture

The example connects three systems:

**x402r Protocol (on-chain)** -- USDC payment flows into `AuthCaptureEscrow`, managed by a `PaymentOperator`. Three condition contracts gate the refund flow: `EscrowPeriod` (time lock), `RefundRequest` (arbiter approve/deny), and `RefundRequestEvidence` (on-chain CID storage for structured evidence).

**Kleros (on-chain, separate)** -- `KlerosCoreRuler` is the mock arbitrator for instant testnet rulings. In production this would be the real `KlerosCore` with juror voting. `DisputeResolverRuler` is the arbitrable contract that creates disputes and receives `rule()` callbacks from the Ruler.

**IPFS (off-chain)** -- Evidence is structured JSON (ERC-1497), pinned to IPFS via Pinata. The CID is stored on-chain in x402r's `RefundRequestEvidence` contract.

## Prerequisites

- Node.js 18+
- Wallet with Arbitrum Sepolia ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Arbitrum Sepolia)
- Free [Pinata](https://pinata.cloud) account (for IPFS uploads -- grab the JWT from API Keys)

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages
> (not npm) because the published `@x402r/core@0.1.0` doesn't include Arbitrum Sepolia.
> Run `pnpm build` in `x402r-sdk/` first if you haven't already.

## Running

Each script reads/writes `context.json` to pass state to the next step.

```bash
# 1. Deploy operator, authorize USDC payment, request refund
pnpm run setup

# 2. Submit structured evidence (payer + merchant) via plugin
pnpm run evidence

# 3. Create dispute on KlerosCoreRuler via plugin
pnpm run dispute

# 4. Give ruling (1 = Payer Wins, 2 = Receiver Wins)
pnpm run give-ruling 1

# 5. Read ruling from Kleros, execute on x402r (approve/deny refund)
pnpm run ruling
```

## Self-deployed Kleros contracts

Kleros has [KlerosCoreRuler](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/devtools/KlerosCoreRuler.sol) and [DisputeResolverRuler](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/devtools/DisputeResolverRuler.sol) deployed on Arbitrum mainnet but not on Arb Sepolia. The address they provided as the "Ruler" (`0x1Bd4...`) is actually a regular KlerosCore (full juror-based system) -- we verified by checking the implementation bytecode behind the proxy.

We deployed both contracts ourselves on Arb Sepolia using the compiled bytecode from `@kleros/kleros-v2-contracts`:

- **KlerosCoreRuler** -- UUPS proxy, initialized with court 1 at 0.0001 ETH per juror
- **DisputeResolverRuler** -- the arbitrable contract that creates disputes and implements `rule()`

The deploy script is included:

```bash
pnpm run deploy-ruler
```

The Kleros [Ruler UI](https://dev--kleros-v2-testnet-devtools.netlify.app/ruler) is hardcoded to Kleros's own address, so rulings are given programmatically via `pnpm run give-ruling`. Once Kleros deploys the official Ruler on Arb Sepolia, the UI will work and the `give-ruling` script becomes optional.

## How It Works

### Contract interactions per script

**Script 1 -- Setup** (`1-setup-dispute.ts`):
```
USDC.balanceOf(wallet)                             -> check balance
PaymentOperatorFactory.deploy(config)               -> deploy operator + all conditions
USDC.receiveWithAuthorization(ERC-3009 sig)         -> move USDC into escrow
RefundRequest.requestRefund(paymentInfo, amount)    -> create pending refund
```

**Script 2 -- Evidence** (`2-submit-evidence.ts`):
```
Pinata.pinJSONToIPFS(evidence)                      -> upload to IPFS, get CID
RefundRequestEvidence.submit(paymentInfo, nonce, CID) -> store CID on-chain
  (repeated for payer and merchant)
```

**Script 3 -- Dispute** (`3-create-dispute.ts`):
```
RefundRequestEvidence.getBatch(paymentInfo)          -> read CIDs from x402r
  + fetch each CID from IPFS gateway                -> reconstruct evidence
KlerosCoreRuler.changeRulingModeToManual(resolver)  -> wallet becomes ruler
KlerosCoreRuler.arbitrationCost(extraData)           -> get dispute creation fee
DisputeResolverRuler.createDisputeForTemplate(...)   -> create dispute (sends ETH)
  -> emits DisputeCreation(disputeID)
```

**Script 3b -- Give Ruling** (`3b-give-ruling.ts`):
```
KlerosCoreRuler.executeRuling(disputeID, ruling, tied, overridden) -> store ruling + call rule()
```

**Script 4 -- Execute on x402r** (`4-execute-ruling.ts`):
```
KlerosCoreRuler.currentRuling(disputeID)             -> read ruling (0/1/2)
RefundRequest.approve(paymentInfo, nonce, amount)     -> if ruling = 1 (Payer Wins)
  OR RefundRequest.deny(paymentInfo, nonce)           -> if ruling = 2 (Receiver Wins)
RefundRequest.get(paymentInfo, nonce)                 -> verify final status
```

### The Plugin Pattern

The core demo is `.extend(klerosActions(config))` -- a plugin that adds Kleros-specific methods to any x402r client:

```typescript
import { createArbiterClient } from '@x402r/sdk'
import { klerosActions, createPinataUploader, pinataFetcher } from './kleros-plugin/index.js'

const arbiter = createArbiterClient({ ... }).extend(
  klerosActions({
    arbitrator: KLEROS.klerosCoreRuler,
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(jwt),
    ipfsFetcher: pinataFetcher,
  })
)

// Submit evidence
await arbiter.kleros.submitEvidence(paymentInfo, 0n, { name: '...', description: '...' })

// Create dispute (sets ruling mode + creates via DisputeResolverRuler)
const { disputeID } = await arbiter.kleros.createDispute(paymentInfo, 0n)

// Read ruling
const ruling = await arbiter.kleros.getRuling(disputeID)

// Execute ruling on x402r
await arbiter.kleros.executeRuling(paymentInfo, 0n, ruling, amount)
```

Five methods added by `klerosActions`:

| Method | What it does |
|--------|-------------|
| `submitEvidence()` | JSON-stringify evidence, pin to IPFS via Pinata, store CID on-chain |
| `getEvidence()` | Read CIDs from chain, fetch from IPFS, parse back to structured objects |
| `createDispute()` | Set ruling mode, create dispute via DisputeResolverRuler on KlerosCoreRuler |
| `getRuling()` | Read current ruling from KlerosCoreRuler |
| `executeRuling()` | Map Kleros ruling (0=abstain, 1=payer wins, 2=receiver wins) to x402r refund action |

## Known Limitations

### Workspace package links

The published `@x402r/core@0.1.0` on npm doesn't include Arbitrum Sepolia in its chain config. This example links to the workspace source packages instead (`link:../../x402r-sdk/packages/core`). You need to build the SDK first (`cd x402r-sdk && pnpm build`).

### `@kleros/kleros-v2-contracts` CJS workaround

The Kleros package ships CJS code in its `esm/` directory, breaking ESM imports. We use `createRequire` in `src/kleros-contracts.ts` to load it as CJS and re-export the ABIs we need.

### Self-deployed Kleros contracts

We deployed our own KlerosCoreRuler and DisputeResolverRuler on Arb Sepolia because Kleros hasn't deployed them on testnet yet. The Ruler UI is hardcoded to Kleros's address, so rulings must be given programmatically via the `give-ruling` script. See `recommendations.md` for details.

### What production would look like

```
                   Ideal Flow (production)

1. Payer/merchant submit evidence via klerosActions plugin     <- same as now
2. Arbiter bot calls DisputeResolver.createDisputeForTemplate()
   -> DisputeResolver calls KlerosCore.createDispute()          <- real jurors
3. Jurors vote on Kleros Court (days/weeks)
4. KlerosCore.currentRuling() returns real verdict
   -> Arbiter bot calls klerosActions.executeRuling()           <- same as now
   -> Refund approved or denied on x402r
```

The plugin pattern and evidence flow are production-ready. Only the ruling mechanism changes (real jurors instead of the Ruler).

## Contracts

### x402r (deployed per-operator)

| Contract | Role |
|----------|------|
| PaymentOperator | Authorize, charge, refund payments |
| EscrowPeriod | Time-lock condition on funds |
| RefundRequest | Arbiter approve/deny refund requests |
| RefundRequestEvidence | Store evidence CIDs on-chain |

### Kleros (Arbitrum Sepolia -- self-deployed)

| Contract | Address |
|----------|---------|
| KlerosCoreRuler (proxy) | `0x58d4348bb6aeab75d09483e407f348b8497d381a` |
| KlerosCoreRuler (impl) | `0x64733ce909ab8735d982943cb69d01293b704a52` |
| DisputeResolverRuler | `0x51e62414b8fbf5fe02390002d0530b08c1166302` |
