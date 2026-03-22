# x402r-kleros-example

Kleros arbitration for x402r refund disputes on Arbitrum Sepolia.

## Background

x402r adds refunds to x402 payments. Funds are held in escrow after payment. A payer can request a refund; an **arbiter** (a contract with permission to call `RefundRequest.approve()` / `.deny()`) decides the outcome.

This example makes `ArbitrableX402r` the arbiter. It is a contract that forwards disputes to Kleros. Jurors review evidence, vote on a ruling, and the contract executes the result on x402r.

## Flow

```
Payer   -> kleros.request()  -> creates refund request + Kleros dispute + evidence
Jurors  -> KlerosCore.rule() -> ArbitrableX402r.rule() stores the ruling
Arbiter -> kleros.approve()  -> ArbitrableX402r.executeRuling() -> RefundRequest.approve/deny
```

`rule()` only stores the ruling. `executeRuling()` acts on it. This split prevents Kleros from getting stuck if the x402r call reverts. The plugin merges both into one `approve()` / `deny()` call.

Evidence is uploaded to IPFS once, then the CID is submitted to two contracts: x402r's `RefundRequestEvidence` (queryable via SDK) and `ArbitrableX402r` (emits ERC-1497 `Evidence` events for the Kleros juror UI).

## Quick look

```typescript
import { createPayerClient, createArbiterClient } from '@x402r/sdk'
import { klerosActions } from './kleros-plugin/index.js'

const payer = createPayerClient(config).extend(klerosActions(klerosConfig))

// payer: request refund + create dispute + submit evidence
await payer.kleros.request(paymentInfo, amount, nonce, evidence)

// arbiter: approve or deny (ruling + execution in one call)
await arbiter.kleros.approve(localDisputeID, arbitratorDisputeID, paymentInfo)
await arbiter.kleros.deny(localDisputeID, arbitratorDisputeID, paymentInfo)
```

## Quick start

Requires Node.js 18+, pnpm, Foundry. Wallet needs Arb Sepolia ETH and USDC (`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`). Evidence upload needs a [Pinata](https://pinata.cloud) JWT (free tier).

```bash
pnpm install
pnpm run build                # forge build + generate typed ABI

cp .env.payer.example .env.payer
cp .env.merchant.example .env.merchant
cp .env.arbiter.example .env.arbiter
# edit each with PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT
# (same key in all three works for demo)

pnpm run setup                # deploy contracts (see below)
pnpm run client               # payer: authorize payment + dispute refund
pnpm run merchant             # merchant: review + counter-evidence
pnpm run arbiter 1            # arbiter: approve (1) or deny (2)
```

`setup` deploys `ArbitrableX402r`, sets `KlerosCoreRuler` to manual ruling mode, then calls `deployMarketplaceOperator()` from `@x402r/core` which deploys PaymentOperator, EscrowPeriod (300s), RefundRequest, and RefundRequestEvidence. `ArbitrableX402r` is set as the arbiter. All addresses are saved to `context.json`.

`KlerosCoreRuler` at `0x58d4348bb6aeab75d09483e407f348b8497d381a` is shared infrastructure we deployed on Arb Sepolia (Kleros has no official deployment there). Reusable by anyone. Only run `deploy-ruler` if you need it on a new chain.

## Plugin API

The plugin extends the x402r SDK client via `.extend()`. Method names mirror the SDK's `refund.*` and `evidence.*` actions.

```typescript
// request refund + Kleros dispute + optional evidence
await client.kleros.request(paymentInfo, amount, nonce, evidence?)

// approve (ruling: PayerWins) or deny (ruling: ReceiverWins)
// checks if already ruled (mainnet) — skips giveRuling if so
await client.kleros.approve(localDisputeID, arbitratorDisputeID, paymentInfo)
await client.kleros.deny(localDisputeID, arbitratorDisputeID, paymentInfo)

// dual-channel evidence: IPFS upload -> x402r + ArbitrableX402r (ERC-1497)
await client.kleros.submitEvidence(paymentInfo, nonce, evidence, arbitratorDisputeID?)

// reads
await client.kleros.getEvidence(paymentInfo, nonce)   // fetches CIDs from x402r, resolves from IPFS
await client.kleros.getRuling(arbitratorDisputeID)     // reads currentRuling from KlerosCore
await client.kleros.getDispute(localDisputeID)         // reads dispute data from ArbitrableX402r
```

`KlerosConfig`:

```typescript
{
  arbitrator: Address,        // KlerosCoreRuler address
  arbitrableX402r: Address,   // ArbitrableX402r (the arbiter)
  extraData: Hex,             // abi.encode(courtId, minJurors)
  ipfsUploader?: IpfsUploader,  // needed for request() and submitEvidence()
  ipfsFetcher?: IpfsFetcher,    // needed for getEvidence()
}
```

## Scripts

| Script | What it does |
|--------|-------------|
| `build` | `forge build` + generate typed ABI from Foundry artifact |
| `setup` | Deploy ArbitrableX402r, set Ruler to manual mode, deploy x402r operator stack |
| `client` | Sign + submit authorization, `kleros.request()` |
| `merchant` | Review evidence, submit counter-evidence |
| `arbiter` | Review evidence, `kleros.approve()` or `kleros.deny()` |
| `deploy-ruler` | Deploy `KlerosCoreRuler` on a new chain (rarely needed) |

## Contracts

| Contract | What it does |
|----------|-------------|
| `ProtocolArbitrable` | Abstract base. Receives rulings via `rule()`, emits ERC-1497 evidence events, manages dispute storage. Reusable by any protocol. |
| `ArbitrableX402r` | Extends `ProtocolArbitrable` with x402r-specific logic. `createDispute()` links a Kleros dispute to a refund request. `executeRuling()` calls `RefundRequest.approve()` or `.deny()` based on the ruling. |

## Ruling outcomes

| Kleros ruling | x402r action | Refund status |
|---|---|---|
| 1 (PayerWins) | `RefundRequest.approve()` | Approved |
| 2 (ReceiverWins) | `RefundRequest.deny()` | Denied |
| 0 (RefusedToArbitrate) | `RefundRequest.refuse()` | Refused |

Ruling 0 happens when jurors abstain or the dispute is invalid. The refund request is closed (not left pending).

## Evidence

Evidence is a JSON object uploaded to IPFS: `{name, description, fileURI?}` where `fileURI` is an optional IPFS link to an attachment. The plugin uploads once, then submits the CID to two places:

1. x402r's `RefundRequestEvidence` — stored on-chain, queryable via SDK
2. `ArbitrableX402r` — emits an `Evidence` event so Kleros jurors can see it

On-chain bridging (ArbitrableX402r reading directly from x402r evidence) is possible but deferred. The plugin handles dual-submission for now.

## Notes

- **Testnet only** — uses `KlerosCoreRuler` (mock arbitrator with manual rulings). On mainnet, real jurors vote and `approve()`/`deny()` skip the ruling step automatically.
- **Ruler UI** — for manual testnet rulings outside the scripts, use the [Kleros devtools UI](https://dev--kleros-v2-testnet-devtools.netlify.app/ruler).
- **PaymentInfo constructed manually** — the scripts build `PaymentInfo` directly instead of receiving it from an HTTP 402 response. Keeps the example focused on the integration.
- **300s escrow** — real Kleros disputes take days/weeks. Production deployments need a longer escrow period or a freeze condition.
- **ABI generation** — `pnpm run build` compiles contracts and generates `src/kleros-plugin/generated.ts`. Re-run after contract changes.
- **`deploy-ruler`** — deploys `KlerosCoreRuler` (implementation + hardcoded ERC1967 proxy). The Kleros npm package doesn't ship a proxy, so the bytecode is inlined.
- **`evm_version = "paris"`** — Arb Sepolia lacks PUSH0. Remove from `foundry.toml` for chains that support it.
