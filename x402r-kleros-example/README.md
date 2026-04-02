# x402r-kleros-example

Kleros arbitration for x402r refund disputes on Arbitrum Sepolia.

## Background

x402r adds refunds to x402 payments. Funds are held in escrow after payment. A payer can request a refund; an **arbiter** (a contract authorized to call `operator.refundInEscrow()` or `RefundRequest.deny()`) decides the outcome.

This example makes `ArbitrableX402r` the arbiter. It forwards disputes to Kleros. Jurors review evidence, vote on a ruling, and the contract executes the result on x402r. RefundRequest tracks dispute state (request/deny/refuse); on PayerWins, the arbiter calls the operator directly and RefundRequest auto-records the approval.

> **Note:** In production x402, `PaymentInfo` comes from a merchant's HTTP 402 response. This example builds it manually in `client.ts`. See the [x402 examples](https://github.com/coinbase/x402/tree/main/examples/typescript) for the full payment flow.

## Flow

```
Payer   -> kleros.request()  -> creates refund request + Kleros dispute + evidence
Jurors  -> KlerosCore.rule() -> ArbitrableX402r.rule() stores the ruling
Anyone  -> kleros.execute()  -> ArbitrableX402r.executeRuling()
            PayerWins:  operator.refundInEscrow() (RefundRequest auto-records)
            ReceiverWins: RefundRequest.deny()
            Refused:      RefundRequest.refuse()
```

`rule()` only stores the ruling. `executeRuling()` acts on it. This split prevents Kleros from getting stuck if the x402r call reverts.

Evidence is uploaded to IPFS as JSON, then the CID is submitted to `ArbitrableX402r` which emits `Evidence` events for the Kleros juror UI.

## Quick look

```typescript
import { createPayerClient, createArbiterClient } from '@x402r/sdk'
import { klerosActions, KlerosRuling } from './kleros-plugin/index.js'

// payer: request refund + create dispute + submit evidence
const payer = createPayerClient(payerConfig).extend(klerosActions(klerosConfig))
await payer.kleros.request(paymentInfo, amount, evidence)

// arbiter: discover dispute on-chain, give ruling, execute
const arbiter = createArbiterClient(arbiterConfig).extend(klerosActions(klerosConfig))
const { localDisputeID, arbitratorDisputeID } = await arbiter.kleros.getLatestDispute()
await arbiter.kleros.giveRuling(arbitratorDisputeID, KlerosRuling.PayerWins) // testnet only
await arbiter.kleros.execute(localDisputeID, paymentInfo)
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

`setup` deploys `ArbitrableX402r`, sets `KlerosCoreRuler` to manual ruling mode, then calls `deployMarketplaceOperator()` from `@x402r/core` which deploys PaymentOperator, EscrowPeriod (300s), and RefundRequest. `ArbitrableX402r` is set as the arbiter. All addresses are saved to `context.json`.

`KlerosCoreRuler` at `0x58d4348bb6aeab75d09483e407f348b8497d381a` is shared infrastructure we deployed on Arb Sepolia (Kleros has no official deployment there). Reusable by anyone. Only run `deploy-ruler` if you need it on a new chain.

## Plugin API

The plugin extends any x402r SDK client via `.extend()`.

**Payer:**

```typescript
const payer = createPayerClient(config).extend(klerosActions(klerosConfig))

// request() bundles: refund request + Kleros dispute + evidence submission
const { dispute } = await payer.kleros.request(paymentInfo, amount, evidence)

// submitEvidence() is for adding additional evidence later
await payer.kleros.submitEvidence(moreEvidence, dispute.arbitratorDisputeID)
```

**Arbiter:**

```typescript
const arbiter = createArbiterClient(config).extend(klerosActions(klerosConfig))

// discover dispute + resolve paymentInfo on-chain
const { localDisputeID, arbitratorDisputeID, dispute } = await arbiter.kleros.getLatestDispute()
const { keys } = await arbiter.refund!.getOperatorRequests(operatorAddress, 0n, 100n)
const req = await arbiter.refund!.getByKey(keys[keys.length - 1])
const paymentInfo = await arbiter.refund!.getStoredPaymentInfo(req.paymentInfoHash)

// give ruling (testnet only — on mainnet, jurors vote and rule() is called automatically)
await arbiter.kleros.giveRuling(arbitratorDisputeID, KlerosRuling.PayerWins)

// execute the stored ruling on x402r (same call on testnet and mainnet)
await arbiter.kleros.execute(localDisputeID, paymentInfo)
```

**KlerosConfig:**

```typescript
{
  arbitrator: Address,          // KlerosCoreRuler address
  arbitrableX402r: Address,     // ArbitrableX402r (the arbiter)
  extraData: Hex,               // abi.encode(courtId, minJurors)
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
| `ArbitrableX402r` | Extends `ProtocolArbitrable`. `createDispute()` links a Kleros dispute to a refund request. `executeRuling()` calls `operator.refundInEscrow()`, `deny()`, or `refuse()` based on the ruling. |

## Notes

- **Ruling outcomes** — ruling 1 (PayerWins) calls `operator.refundInEscrow()` (RefundRequest auto-records approval), ruling 2 (ReceiverWins) calls `deny()`, ruling 0 (RefusedToArbitrate) calls `refuse()`. Ruling 0 closes the request (not left pending).
- **Two dispute IDs** — `localDisputeID` is ArbitrableX402r's internal index. `arbitratorDisputeID` is Kleros's ID. `request()` returns both. `getLatestDispute()` resolves both on-chain.
- **Testnet only** — `giveRuling()` simulates jurors via `KlerosCoreRuler`. Not needed on mainnet. `execute()` works the same on both.
- **Ruler UI** — for manual testnet rulings outside the scripts, use the [Kleros devtools UI](https://dev--kleros-v2-testnet-devtools.netlify.app/ruler).
- **Evidence** — JSON uploaded to IPFS (`{name, description, fileURI?}`), CID submitted to ArbitrableX402r which emits `Evidence` events for the Kleros juror UI.
- **Event watching** — the SDK has `watch` actions for real-time event listening. A production arbiter would use `onRefundRequest` instead of polling `getLatestDispute()`.
- **300s escrow** — real Kleros disputes take days/weeks. Production needs a longer escrow or a freeze condition.
- **ABI generation** — `pnpm run build` generates `src/kleros-plugin/generated.ts` from the Foundry artifact. Re-run after contract changes.
- **`deploy-ruler`** — deploys `KlerosCoreRuler` (implementation + hardcoded ERC1967 proxy). The Kleros npm package doesn't ship a proxy.
- **`evm_version = "paris"`** — Arb Sepolia lacks PUSH0. Remove from `foundry.toml` for chains that support it.
