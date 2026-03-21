# x402r + Kleros Arbitration Example

Toy example showing how to integrate [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

**Chain:** Arbitrum Sepolia (421614)

## Architecture

The example connects three systems:

**x402r Protocol (on-chain)** — USDC flows into `AuthCaptureEscrow`, managed by a `PaymentOperator` that handles authorize/charge/refund. Three condition contracts gate the refund flow: `EscrowPeriod` (time lock), `RefundRequest` (arbiter approve/deny), and `RefundRequestEvidence` (on-chain CID storage for structured evidence).

**Kleros (on-chain, separate)** — `KlerosCoreRuler` is the mock arbitrator for instant testnet rulings. In production this would be the real `KlerosCore` with juror voting. `DisputeResolver` creates disputes with structured templates, and `EvidenceModule` stores per-dispute evidence.

**IPFS (off-chain)** — Evidence is structured JSON (ERC-1497), pinned to IPFS via Pinata. The CID is stored on-chain in x402r's `RefundRequestEvidence` contract. The arbiter bot reads CIDs from x402r, fetches the JSON from an IPFS gateway, and bridges it to Kleros.

## Prerequisites

- Node.js 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for deploying helper contracts)
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

# 3. Read evidence from x402r, create dispute on KlerosCoreRuler
pnpm run bridge

# 4. Execute ruling on x402r (approve/deny refund)
#    Use --force to simulate a "payer wins" ruling (see Known Limitations)
pnpm run ruling -- --force
```

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

**Script 3 — Bridge** (`3-bridge-to-kleros.ts`):
```
RefundRequestEvidence.getBatch(paymentInfo)          → read CIDs from x402r
  + fetch each CID from IPFS gateway                → reconstruct evidence
KlerosCoreRuler.arbitrationCost(extraData)           → get dispute creation fee
KlerosCoreRuler.createDispute(choices, extraData)    → create dispute (sends ETH)
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

The core demo is `.extend(klerosActions)` — a plugin that adds Kleros-specific methods to any x402r client:

```typescript
import { createPayerClient } from '@x402r/sdk'
import { klerosActions, createPinataUploader } from './kleros-plugin/index.js'

const payer = createPayerClient({ ... }).extend(klerosActions)
const uploader = createPinataUploader(process.env.PINATA_JWT!)

await payer.kleros.submitEvidence(paymentInfo, 0n, {
  name: 'Service Not Delivered',
  description: 'Paid 10 USDC for API access but got 500 errors.',
}, uploader)
```

Three methods added by `klerosActions`:

| Method | What it does |
|--------|-------------|
| `submitEvidence()` | JSON-stringify evidence, pin to IPFS via Pinata, store CID on-chain |
| `getEvidence()` | Read CIDs from chain, fetch from IPFS, parse back to structured objects |
| `executeRuling()` | Map Kleros ruling (0=abstain, 1=payer wins, 2=receiver wins) to x402r refund action |

## Known Limitations

This is a toy example. Several workarounds were needed due to testnet infrastructure:

### `--force` flag (no real Kleros ruling)

The KlerosCoreRuler on Arb Sepolia requires **governor access** to give rulings — only the Kleros team can call `changeRulingModeToManual()` and `executeRuling()`. Since we don't have governor access, script 4 supports a `--force` flag that bypasses the ruling check and executes a "Payer Wins" refund directly using the arbiter role.

In production, disputes would go through the real KlerosCore with actual juror voting. The arbiter bot would poll `currentRuling()` and get a real verdict.

### Dispute created directly on Ruler (not via DisputeResolver)

Ideally, script 3 would use `DisputeResolver.createDisputeForTemplate()` to create a dispute with a structured template and bridge evidence to `EvidenceModule`. However, the testnet DisputeResolver (`0xed31...`) is connected to the regular KlerosCore, not the KlerosCoreRuler. We create disputes directly on the Ruler instead, which means no dispute template or EvidenceModule integration.

### Workspace package links

The published `@x402r/core@0.1.0` on npm doesn't include Arbitrum Sepolia in its chain config. This example links to the workspace source packages instead (`link:../../x402r-sdk/packages/core`). You need to build the SDK first (`cd x402r-sdk && pnpm build`).

### `@kleros/kleros-v2-contracts` CJS workaround

The Kleros package ships CJS code in its `esm/` directory, breaking ESM imports. We use `createRequire` in `src/kleros-contracts.ts` to load it as CJS and re-export the ABIs and addresses we need.

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
| DisputeResolver | `0xed31bEE8b1F7cE89E93033C0d3B2ccF4cEb27652` |
| EvidenceModule | `0xA88A9a25cE7f1d8b3941dA3b322Ba91D009E1397` |
