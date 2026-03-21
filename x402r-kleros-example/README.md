# x402r + Kleros Arbitration Example

Toy example showing how to integrate [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

**Chain:** Arbitrum Sepolia (421614) — uses KlerosCoreRuler (instant mock rulings).

## Prerequisites

- Node.js 18+
- Wallet with Arbitrum Sepolia ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)) and USDC (`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`)
- Free [Pinata](https://pinata.cloud) account (for IPFS uploads)

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
```

## Running

Each script reads/writes `context.json` to pass state to the next step.

```bash
# 1. Deploy operator, authorize payment, request refund
pnpm run setup

# 2. Submit structured evidence (payer + merchant) via plugin
pnpm run evidence

# 3. Create Kleros dispute, bridge evidence to EvidenceModule
pnpm run bridge

# === Go to Kleros Ruler UI and give a ruling ===
# https://dev--kleros-v2-testnet-devtools.netlify.app/ruler
# Connect to Arbitrum Sepolia, find your dispute ID (printed by script 3)

# 4. Read Kleros ruling, execute on x402r (approve/deny refund)
pnpm run ruling
```

## How It Works

1. **Setup** (`1-setup-dispute.ts`) — Deploys a PaymentOperator, authorizes a 10 USDC payment, and requests a refund. Saves addresses + PaymentInfo to `context.json`.

2. **Evidence** (`2-submit-evidence.ts`) — Both payer and merchant submit ERC-1497 structured evidence via `payer.kleros.submitEvidence()`. Evidence is JSON-stringified, pinned to IPFS via Pinata, and the CID is stored on-chain in x402r's RefundRequestEvidence contract.

3. **Bridge** (`3-bridge-to-kleros.ts`) — Reads evidence from x402r, creates a Kleros dispute via `DisputeResolver.createDisputeForTemplate()`, and submits evidence to Kleros's `EvidenceModule`. Saves both dispute IDs to context.

4. **Ruling** (`4-execute-ruling.ts`) — Polls `KlerosCoreRuler.currentRuling()` and maps the result to an x402r refund action via `arbiter.kleros.executeRuling()`.

## The Plugin Pattern

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

The `klerosActions` plugin adds three methods to any x402r client:

- **`submitEvidence()`** — Upload structured evidence to IPFS, store CID on-chain
- **`getEvidence()`** — Read CIDs from chain, fetch and parse from IPFS
- **`executeRuling()`** — Map Kleros ruling (0/1/2) to x402r refund action

## Kleros Contracts (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| KlerosCoreRuler | `0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9` |
| DisputeResolver | `0xed31bEE8b1F7cE89E93033C0d3B2ccF4cEb27652` |
| EvidenceModule | `0xA88A9a25cE7f1d8b3941dA3b322Ba91D009E1397` |
