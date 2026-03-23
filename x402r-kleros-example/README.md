# x402r-kleros-example

Kleros arbitration for x402r refund disputes on Arbitrum Sepolia.

## Background

x402r adds refunds to x402 payments. Funds are held in escrow after payment. A payer can request a refund; an **arbiter** (a contract with permission to call `RefundRequest.approve()` / `.deny()`) decides the outcome.

This example makes `ArbitrableX402r` the arbiter. It is a contract that forwards disputes to Kleros. Jurors review evidence, vote on a ruling, and the contract executes the result on x402r.

> **Note:** In production x402, `PaymentInfo` comes from a merchant's HTTP 402 response — the payer never constructs it manually. This example skips the HTTP flow entirely and builds `PaymentInfo` in `client.ts` for simplicity. See the [x402 examples](https://github.com/coinbase/x402/tree/main/examples/typescript) for the full payment flow.

## Flow

```
Payer   -> kleros.request()  -> creates refund request + Kleros dispute + evidence
Jurors  -> KlerosCore.rule() -> ArbitrableX402r.rule() stores the ruling
Anyone  -> kleros.execute()  -> ArbitrableX402r.executeRuling() -> RefundRequest.approve/deny/refuse
```

`rule()` only stores the ruling. `executeRuling()` acts on it. This split prevents Kleros from getting stuck if the x402r call reverts.

Evidence is uploaded to IPFS once, then the CID is submitted to two contracts: x402r's `RefundRequestEvidence` (queryable via SDK) and `ArbitrableX402r` (emits `Evidence` events for the Kleros juror UI).

## Quick look

```typescript
import { createPayerClient, createArbiterClient } from '@x402r/sdk'
import { klerosActions, KlerosRuling } from './kleros-plugin/index.js'

// payer: request refund + create Kleros dispute + submit evidence
const payer = createPayerClient(payerConfig).extend(klerosActions(klerosConfig))
const { dispute } = await payer.kleros.request(paymentInfo, amount, 0n, evidence)

// arbiter: give ruling (testnet only) + execute on x402r
const arbiter = createArbiterClient(arbiterConfig).extend(klerosActions(klerosConfig))
await arbiter.kleros.giveRuling(dispute.arbitratorDisputeID, KlerosRuling.PayerWins) // testnet only
await arbiter.kleros.execute(dispute.localDisputeID, paymentInfo)
```

## Quick start

Requires Node.js 18+, pnpm, Foundry. Wallet needs Arb Sepolia ETH and USDC. Evidence upload needs a [Pinata](https://pinata.cloud) JWT (free tier).

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
pnpm run arbiter 1            # arbiter: give ruling + execute (1=approve, 2=deny)
```

`setup` deploys `ArbitrableX402r`, sets `KlerosCoreRuler` to manual ruling mode, then calls `deployMarketplaceOperator()` from `@x402r/core` which deploys PaymentOperator, EscrowPeriod (300s), RefundRequest, and RefundRequestEvidence. `ArbitrableX402r` is set as the arbiter. All addresses are saved to `context.json`.

`KlerosCoreRuler` at `0x58d4348bb6aeab75d09483e407f348b8497d381a` is shared infrastructure we deployed on Arb Sepolia (Kleros has no official deployment there). Reusable by anyone. Only run `deploy-ruler` if you need it on a new chain.

## Plugin API

The plugin extends any x402r SDK client via `.extend()`.

**Payer** — request refund + create dispute:

```typescript
const payer = createPayerClient(config).extend(klerosActions(klerosConfig))
const { dispute } = await payer.kleros.request(paymentInfo, amount, nonce, evidence)
await payer.kleros.submitEvidence(paymentInfo, nonce, evidence, dispute.arbitratorDisputeID)
```

**Arbiter** — discover dispute on-chain, rule:

ArbitrableX402r tracks disputes with two IDs: `localDisputeID` (index in the contract's disputes array) and `arbitratorDisputeID` (Kleros's internal ID). Both are returned by `request()` and discoverable on-chain:

```typescript
const arbiter = createArbiterClient(config).extend(klerosActions(klerosConfig))

// discover the latest dispute
const count = await arbiter.kleros.getDisputeCount()
const localDisputeID = count - 1n
const dispute = await arbiter.kleros.getDispute(localDisputeID)
const arbitratorDisputeID = await arbiter.kleros.getArbitratorDisputeID(localDisputeID)

// paymentInfo is stored on-chain by RefundRequest when the payer files a dispute
const paymentInfo = await arbiter.refund!.getStoredPaymentInfo(paymentInfoHash)
```

```typescript
// testnet: simulate jurors (not needed on mainnet)
await arbiter.kleros.giveRuling(arbitratorDisputeID, KlerosRuling.PayerWins)

// execute the stored ruling on x402r (same on testnet and mainnet)
await arbiter.kleros.execute(localDisputeID, paymentInfo)
```

**Reads** (any role):

```typescript
await client.kleros.getEvidence(paymentInfo, nonce)
await client.kleros.getRuling(arbitratorDisputeID)
await client.kleros.getDisputeCount()
await client.kleros.getArbitratorDisputeID(localDisputeID)
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
| `merchant` | Discover dispute on-chain, review evidence, submit counter-evidence |
| `arbiter` | Discover dispute on-chain, review evidence, `giveRuling()` + `execute()` |
| `deploy-ruler` | Deploy `KlerosCoreRuler` on a new chain (rarely needed) |

## Contracts

| Contract | What it does |
|----------|-------------|
| `ProtocolArbitrable` | Abstract base. Receives rulings via `rule()`, emits evidence events, manages dispute storage. Reusable by any protocol. |
| `ArbitrableX402r` | Extends `ProtocolArbitrable` with x402r-specific logic. `createDispute()` links a Kleros dispute to a refund request. `executeRuling()` calls `approve()`, `deny()`, or `refuse()` based on the ruling. |

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

- **Testnet only** — uses `KlerosCoreRuler` (mock arbitrator with manual rulings). `giveRuling()` simulates jurors and is not needed on mainnet. `execute()` works the same on both.
- **Two dispute IDs** — `localDisputeID` is ArbitrableX402r's internal index. `arbitratorDisputeID` is Kleros's ID. `request()` returns both. The arbiter can also discover them on-chain via `getDisputeCount()` and `getArbitratorDisputeID()`.
- **Ruler UI** — for manual testnet rulings outside the scripts, use the [Kleros devtools UI](https://dev--kleros-v2-testnet-devtools.netlify.app/ruler).
- **300s escrow** — real Kleros disputes take days/weeks. Production deployments need a longer escrow period or a freeze condition.
- **ABI generation** — `pnpm run build` compiles contracts and generates `src/kleros-plugin/generated.ts`. Re-run after contract changes.
- **`deploy-ruler`** — deploys `KlerosCoreRuler` (implementation + hardcoded ERC1967 proxy). The Kleros npm package doesn't ship a proxy, so the bytecode is inlined.
- **`evm_version = "paris"`** — Arb Sepolia lacks PUSH0. Remove from `foundry.toml` for chains that support it.
