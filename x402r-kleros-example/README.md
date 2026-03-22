# x402r + Kleros Arbitration Example

Example showing how to integrate [Kleros](https://kleros.io) decentralized arbitration with x402r refundable payments using the `.extend(klerosActions)` plugin pattern.

**Chain:** Arbitrum Sepolia (421614)

## Architecture

**x402r Protocol (on-chain)** -- USDC payment flows into `AuthCaptureEscrow`, managed by a `PaymentOperator`. Conditions gate the refund flow: `EscrowPeriod` (time lock), `RefundRequest` (arbiter approve/deny), and `RefundRequestEvidence` (on-chain CID storage).

**Kleros (on-chain, separate)** -- `KlerosCoreRuler` is the mock arbitrator for instant testnet rulings. `DisputeResolverRuler` creates disputes and receives `rule()` callbacks. In production, these would be `KlerosCore` with real juror voting and `DisputeResolver`.

**IPFS (off-chain)** -- Evidence is structured JSON (ERC-1497), pinned to IPFS via Pinata, with CIDs stored on-chain in x402r's `RefundRequestEvidence`.

## Prerequisites

- Node.js 18+
- Wallet with Arbitrum Sepolia ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Arbitrum Sepolia)
- Free [Pinata](https://pinata.cloud) account (for IPFS uploads)

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages.
> Run `pnpm build` in `x402r-sdk/` first if you haven't already.

## Running

```bash
# One-time: deploy operator
pnpm run setup

# Client: make payment, request refund, submit evidence, create dispute
pnpm run client

# Arbiter: review evidence, give ruling, execute on x402r
pnpm run arbiter 1   # 1 = Payer Wins (Refund), 2 = Receiver Wins
```

## Self-deployed Kleros contracts

Kleros has [KlerosCoreRuler](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/devtools/KlerosCoreRuler.sol) and [DisputeResolverRuler](https://github.com/kleros/kleros-v2/blob/dev/contracts/src/arbitration/devtools/DisputeResolverRuler.sol) on Arbitrum mainnet but not on Arb Sepolia. The address they provided as the "Ruler" (`0x1Bd4...`) is actually a regular KlerosCore.

We deployed both ourselves using bytecode from `@kleros/kleros-v2-contracts`:

```bash
pnpm run deploy-ruler
```

The Kleros [Ruler UI](https://dev--kleros-v2-testnet-devtools.netlify.app/ruler) is hardcoded to Kleros's address, so rulings are given programmatically by the arbiter script.

## The Plugin Pattern

`.extend(klerosActions(config))` adds Kleros-specific methods to any x402r client:

```typescript
const arbiter = createArbiterClient({ ... }).extend(
  klerosActions({
    arbitrator: KLEROS.klerosCoreRuler,
    disputeResolver: KLEROS.disputeResolverRuler,
    extraData: KLEROS.extraData,
    ipfsUploader: createPinataUploader(jwt),
    ipfsFetcher: pinataFetcher,
  })
)

await arbiter.kleros.submitEvidence(paymentInfo, 0n, { name: '...', description: '...' })
const { disputeID } = await arbiter.kleros.createDispute(paymentInfo, 0n)
await arbiter.kleros.giveKlerosRuling(disputeID, KlerosRuling.PayerWins)
await arbiter.kleros.executeRuling(paymentInfo, 0n, KlerosRuling.PayerWins, amount)
```

| Method | What it does |
|--------|-------------|
| `submitEvidence()` | Pin evidence JSON to IPFS, store CID on-chain |
| `getEvidence()` | Read CIDs from chain, fetch from IPFS |
| `createDispute()` | Create dispute via DisputeResolverRuler on KlerosCoreRuler |
| `giveKlerosRuling()` | Give ruling on KlerosCoreRuler |
| `getRuling()` | Read current ruling from KlerosCoreRuler |
| `executeRuling()` | Map Kleros ruling to x402r refund action (approve/deny) |

## Known Limitations

- **Workspace package links** -- `@x402r/core` links to workspace source, not npm
- **CJS workaround** -- `@kleros/kleros-v2-contracts` ships CJS in its ESM directory, requires `createRequire`
- **Self-deployed Kleros** -- KlerosCoreRuler and DisputeResolverRuler not on Arb Sepolia yet, Ruler UI hardcoded to Kleros's address. See `recommendations.md`

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
