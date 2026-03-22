# x402r + Kleros Arbitration Example

Integrates [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

## Quick Start

```bash
pnpm run setup              # deploy operator (one-time)
pnpm run client             # pay, request refund, submit evidence, create dispute
pnpm run arbiter 1          # review evidence, rule, execute (1=Refund, 2=No Refund)
```

## Architecture

Three systems work together: x402r (payment escrow), Kleros (dispute resolution), and IPFS (evidence storage).

**x402r (on-chain)** -- USDC payment flows into `AuthCaptureEscrow`, managed by `PaymentOperator`. Conditions gate refunds: `EscrowPeriod` (time lock), `RefundRequest` (arbiter approve/deny), `RefundRequestEvidence` (on-chain CID storage).

**Kleros (on-chain)** -- `KlerosCoreRuler` is a mock arbitrator for instant testnet rulings. `DisputeResolverRuler` creates disputes and receives `rule()` callbacks. In production, these would be `KlerosCore` with real juror voting.

**IPFS (off-chain)** -- Evidence is structured JSON, pinned via Pinata, with CIDs stored on-chain in `RefundRequestEvidence`.

### Flow

1. **Merchant** authorizes a USDC payment via `PaymentOperator` -- funds are held in escrow
2. **Payer** calls `disputeRefund()` which does three things:
   - Requests a refund on `RefundRequest`
   - Pins evidence JSON to IPFS (via Pinata) and stores the CID on `RefundRequestEvidence`
   - Creates a dispute on `KlerosCoreRuler` through `DisputeResolverRuler`
3. **Merchant** submits counter-evidence (same IPFS + on-chain CID flow)
4. **Arbiter** reviews evidence from IPFS, then calls `resolveDispute()` which:
   - Gives a ruling on `KlerosCoreRuler` (PayerWins or ReceiverWins)
   - Executes the ruling on x402r -- calls `RefundRequest.approve()` (releasing escrowed USDC back to payer) or `RefundRequest.deny()`

## Prerequisites

- Node.js 18+
- Wallet with Arbitrum Sepolia ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Arbitrum Sepolia)
- Free [Pinata](https://pinata.cloud) account for IPFS uploads

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages.
> Run `pnpm build` in `x402r-sdk/` first if you haven't already.

## The Plugin

`.extend(klerosActions(config))` adds Kleros methods to any x402r client:

```typescript
import { klerosActions, KlerosRuling, createPinataUploader, pinataFetcher } from './kleros-plugin/index.js'

const arbiter = createArbiterClient({ ... }).extend(
  klerosActions({
    arbitrator: KLEROS.klerosCoreRuler,
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(jwt),
    ipfsFetcher: pinataFetcher,
  })
)
```

| Method | Description |
|--------|-------------|
| **`disputeRefund(paymentInfo, amount, nonce, evidence)`** | Request refund + submit evidence + create Kleros dispute |
| **`resolveDispute(disputeID, paymentInfo, nonce, ruling, amount)`** | Give Kleros ruling + execute on x402r |
| `submitEvidence(paymentInfo, nonce, evidence)` | Pin evidence JSON to IPFS, store CID on-chain |
| `getEvidence(paymentInfo, nonce)` | Read CIDs from chain, fetch from IPFS |
| `getRuling(disputeID)` | Read current ruling from KlerosCoreRuler |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run setup` | Deploy PaymentOperator + conditions (one-time) |
| `pnpm run client` | Authorize payment, then `disputeRefund()` + merchant counter-evidence |
| `pnpm run arbiter [1\|2]` | Review evidence, then `resolveDispute()` + verify |
| `pnpm run deploy-ruler` | Deploy KlerosCoreRuler + DisputeResolverRuler (infrastructure, already done) |

## Limitations

- **Workspace package links** -- `@x402r/core` and `@x402r/sdk` link to workspace source, not npm
- **CJS workaround** -- `@kleros/kleros-v2-contracts` ships CJS in its ESM directory; we use `createRequire` (see `src/kleros-plugin/abi.ts`)
- **Self-deployed Kleros** -- KlerosCoreRuler and DisputeResolverRuler are not on Arb Sepolia officially; the Ruler UI is hardcoded to Kleros's addresses. See `recommendations.md`

## Contracts

### x402r (deployed per-operator via `pnpm run setup`)

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
