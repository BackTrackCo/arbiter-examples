# x402r + Kleros — Toy Example

Working demo of the `klerosActions` `.extend()` plugin for integrating Kleros decentralized arbitration with x402r refundable payments.

**Chain:** Arbitrum Sepolia (421614) — single chain, no bridge needed.

## Architecture

```
Payer (with .extend(klerosActions))
  payer.kleros.submitEvidence(paymentInfo, 0n, {
    name: "Service Not Delivered",
    description: "...",
  }, ipfsUploader)

Arbiter Bot (with .extend(klerosActions))
  arbiter.kleros.executeRuling(paymentInfo, 0n, KlerosRuling.PayerWins)
```

The `klerosActions` plugin extends any x402r client with:

- **`submitEvidence()`** — JSON-stringify structured evidence, upload to IPFS via Pinata, submit CID on-chain
- **`getEvidence()`** — Read on-chain CIDs, fetch from IPFS, parse back to structured `KlerosEvidence`
- **`executeRuling()`** — Map Kleros ruling to x402r refund action (approve/deny)

Evidence format follows ERC-1497:

```typescript
interface KlerosEvidence {
  name: string         // "Service Not Delivered"
  description: string  // Human-readable
  fileURI?: string     // "/ipfs/Qm..." (optional attachment)
}
```

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
```

**Requirements:**
- Wallet funded with Arbitrum Sepolia ETH (for gas) + USDC (`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`)
- Free [Pinata](https://pinata.cloud) account for IPFS uploads

## Running

```bash
# 1. Deploy operator, authorize payment, request refund
pnpm run setup

# 2. Submit structured evidence (payer + merchant) via plugin
pnpm run evidence

# 3. Create Kleros dispute, bridge evidence
pnpm run bridge

# === Go to Kleros Ruler UI and give a ruling ===
# https://ruler.kleros.io (connect to Arbitrum Sepolia)

# 4. Read Kleros ruling, execute on x402r
pnpm run ruling
```

## The Plugin Pattern

The core demo is the `.extend(klerosActions)` pattern from the SDK V2 roadmap:

```typescript
import { createPayerClient } from '@x402r/sdk'
import { klerosActions, pinataUploader } from './kleros-plugin/index.js'

const payer = createPayerClient({ ... }).extend(klerosActions)

// Structured evidence — not raw CIDs
await payer.kleros.submitEvidence(paymentInfo, 0n, {
  name: 'Service Not Delivered',
  description: 'Paid 10 USDC for API access but got 500 errors.',
}, pinataUploader)
```

## Kleros Contracts (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| KlerosCoreRuler | `0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9` |
| DisputeResolver | `0xed31bEE8b1F7cE89E93033C0d3B2ccF4cEb27652` |
| EvidenceModule | `0xA88A9a25cE7f1d8b3941dA3b322Ba91D009E1397` |

## What We Need from Kleros

1. Confirm evidence format compatibility with ERC-1497
2. DisputeResolver + EvidenceModule addresses on Arbitrum One (mainnet)
3. Recommended `extraData` encoding for dispute parameters

## Production Path

- Replace Ruler mock with real KlerosCore on Arbitrum One
- `IDisputeResolver` adapter for automated dispute creation
- Multi-sig arbiter wallet or on-chain Kleros callback
