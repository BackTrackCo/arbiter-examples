# x402r + Kleros Arbitration Example

Toy example showing how to integrate [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

**Chain:** Arbitrum Sepolia (421614)

## Architecture

The example connects three systems:

**x402r Protocol (on-chain)** — USDC flows into `AuthCaptureEscrow`, managed by a `PaymentOperator` that handles authorize/charge/refund. Three condition contracts gate the refund flow: `EscrowPeriod` (time lock), `RefundRequest` (arbiter approve/deny), and `RefundRequestEvidence` (on-chain CID storage for structured evidence).

**Kleros (on-chain, separate)** — `KlerosCoreRuler` is the mock arbitrator for instant testnet rulings. In production this would be the real `KlerosCore` with juror voting. The plugin deploys a `ToyArbitrable` contract that forwards `createDispute()` to the Ruler and accepts `rule()` callbacks.

**IPFS (off-chain)** — Evidence is structured JSON (ERC-1497), pinned to IPFS via Pinata. The CID is stored on-chain in x402r's `RefundRequestEvidence` contract. The arbiter bot reads CIDs from x402r and fetches the JSON from an IPFS gateway.

## Prerequisites

- Node.js 18+
- Wallet with Arbitrum Sepolia ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) — select Arbitrum Sepolia)
- Free [Pinata](https://pinata.cloud) account (for IPFS uploads — grab the JWT from API Keys)

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
# 1. Deploy operator, authorize 10 USDC payment, request refund
pnpm run setup

# 2. Submit structured evidence (payer + merchant) via plugin
pnpm run evidence

# 3. Create dispute on KlerosCoreRuler via plugin
#    (auto-deploys ToyArbitrable, sets ruling mode, creates dispute)
pnpm run dispute

# 4. Give ruling via Ruler UI (see instructions printed by script 3)
#    Then execute ruling on x402r
pnpm run ruling
```

## Ruler UI Instructions

After running `pnpm run dispute`, the script prints the ToyArbitrable address and dispute ID. To give a ruling:

1. Go to: https://dev--kleros-v2-testnet-devtools.netlify.app/ruler
2. Connect wallet to Arbitrum Sepolia
3. Enter the **Arbitrable address** printed by script 3
4. Ruling mode should show "Manual" (the plugin already called `changeRulingModeToManual`)
5. Under "Manual Ruling":
   - **Dispute ID**: the ID printed by script 3
   - **Ruling**: `1` (Payer Wins / Refund) or `2` (Receiver Wins / No Refund)
   - **Tie**: unchecked
   - **Overridden**: unchecked
6. Click "Rule", confirm the transaction
7. Run `pnpm run ruling` to execute the ruling on x402r

### Why ToyArbitrable is needed

KlerosCoreRuler's `executeRuling()` atomically stores the ruling AND calls `arbitrable.rule(disputeID, ruling)`. If the arbitrable is an EOA (like a wallet), the `.rule()` call fails and the entire transaction reverts — the ruling is never stored. ToyArbitrable is a minimal contract that implements `rule()` as a no-op, allowing `executeRuling()` to succeed.

## How It Works

### Contract interactions per script

**Script 1 — Setup** (`1-setup-dispute.ts`):
```
USDC.balanceOf(wallet)                             → check balance
PaymentOperatorFactory.deploy(config)               → deploy operator + all conditions
  (batched via Multicall3 — 6 factory calls in 1 tx)
USDC.receiveWithAuthorization(ERC-3009 sig)         → move 10 USDC into escrow
  called via PaymentOperator.authorize()
RefundRequest.requestRefund(paymentInfo, amount)    → create pending refund
```

**Script 2 — Evidence** (`2-submit-evidence.ts`):
```
Pinata.pinJSONToIPFS(payerEvidence)                 → upload to IPFS, get CID
RefundRequestEvidence.submit(paymentInfo, nonce, CID) → store CID on-chain (payer)
Pinata.pinJSONToIPFS(merchantEvidence)              → upload to IPFS, get CID
RefundRequestEvidence.submit(paymentInfo, nonce, CID) → store CID on-chain (merchant)
```

**Script 3 — Dispute** (`3-create-dispute.ts`):
```
RefundRequestEvidence.getBatch(paymentInfo)          → read CIDs from x402r
  + fetch each CID from IPFS gateway                → reconstruct evidence
deploy ToyArbitrable                                → contract for rule() callback
KlerosCoreRuler.changeRulingModeToManual(arbitrable) → wallet becomes ruler
KlerosCoreRuler.arbitrationCost(extraData)           → get dispute creation fee
ToyArbitrable.createDispute(arbitrator, choices, extraData) → create dispute (sends ETH)
  → emits DisputeCreation(disputeID)
```

**Script 4 — Ruling** (`4-execute-ruling.ts`):
```
KlerosCoreRuler.currentRuling(disputeID)             → read ruling (0/1/2)
RefundRequest.approve(paymentInfo, nonce, amount)     → if ruling = 1 (Payer Wins)
  OR RefundRequest.deny(paymentInfo, nonce)           → if ruling = 2 (Receiver Wins)
RefundRequest.get(paymentInfo, nonce)                 → verify final status
```

### The Plugin Pattern

The core demo is `.extend(klerosActions(config))` — a plugin that adds Kleros-specific methods to any x402r client:

```typescript
import { createArbiterClient } from '@x402r/sdk'
import { klerosActions, createPinataUploader, pinataFetcher } from './kleros-plugin/index.js'

const arbiter = createArbiterClient({ ... }).extend(
  klerosActions({
    arbitrator: '0x1Bd4...',   // KlerosCoreRuler address
    extraData: '0x...',        // courtId + minJurors encoding
    ipfsUploader: createPinataUploader(jwt),
    ipfsFetcher: pinataFetcher,
  })
)

// Submit evidence
await arbiter.kleros.submitEvidence(paymentInfo, 0n, { name: '...', description: '...' })

// Create dispute (auto-deploys ToyArbitrable + sets ruling mode)
const { disputeID, arbitrableAddress } = await arbiter.kleros.createDispute(paymentInfo, 0n)

// Read ruling after Ruler UI
const ruling = await arbiter.kleros.getRuling(disputeID)

// Execute ruling on x402r
await arbiter.kleros.executeRuling(paymentInfo, 0n, ruling, amount)
```

Five methods added by `klerosActions`:

| Method | What it does |
|--------|-------------|
| `submitEvidence()` | JSON-stringify evidence, pin to IPFS via Pinata, store CID on-chain |
| `getEvidence()` | Read CIDs from chain, fetch from IPFS, parse back to structured objects |
| `createDispute()` | Deploy ToyArbitrable, set ruling mode, create dispute on KlerosCoreRuler |
| `getRuling()` | Read current ruling from KlerosCoreRuler |
| `executeRuling()` | Map Kleros ruling (0=abstain, 1=payer wins, 2=receiver wins) to x402r refund action |

## Known Limitations

### Workspace package links

The published `@x402r/core@0.1.0` on npm doesn't include Arbitrum Sepolia in its chain config. This example links to the workspace source packages instead (`link:../../x402r-sdk/packages/core`). You need to build the SDK first (`cd x402r-sdk && pnpm build`).

### `@kleros/kleros-v2-contracts` CJS workaround

The Kleros package ships CJS code in its `esm/` directory, breaking ESM imports. We use `createRequire` in `src/kleros-contracts.ts` to load it as CJS and re-export the ABIs we need.

### What production would look like

```
                   Ideal Flow (production)
                   ═══════════════════════

1. Payer/merchant submit evidence via klerosActions plugin     ← same as now
2. Arbiter bot calls DisputeResolver.createDisputeForTemplate()
   → DisputeResolver calls KlerosCore.createDispute()          ← real jurors
   → Evidence bridged to EvidenceModule
3. Jurors vote on Kleros Court (days/weeks)
4. KlerosCore.currentRuling() returns real verdict
   → Arbiter bot calls klerosActions.executeRuling()           ← same as now
   → Refund approved or denied on x402r
```

The plugin pattern and evidence flow are production-ready. Only the dispute creation and ruling steps need the real Kleros infrastructure.

If Kleros deployed a `DisputeResolver` connected to `KlerosCoreRuler` on testnets, the ToyArbitrable workaround would be unnecessary — `DisputeResolver` already implements `rule()`. See `recommendations.md` for details.

## Contracts

### x402r (deployed per-operator)

| Contract | Role |
|----------|------|
| PaymentOperator | Authorize, charge, refund payments |
| EscrowPeriod | Time-lock condition on funds |
| RefundRequest | Arbiter approve/deny refund requests |
| RefundRequestEvidence | Store evidence CIDs on-chain |

### Kleros (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| KlerosCoreRuler | `0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9` |
