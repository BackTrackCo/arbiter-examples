# x402r-kleros-example

Kleros dispute resolution for x402r refunds on Arbitrum Sepolia.

## How it works

`ArbitrableX402r` is deployed as the arbiter on a marketplace operator. When a payer disputes, it creates a Kleros dispute. When jurors rule, the contract bridges the ruling to `RefundRequest.approve()` or `.deny()`.

```
Payer   -> kleros.request()   -> RefundRequest.request + ArbitrableX402r.createDispute
Jurors  -> KlerosCore.rule()  -> ArbitrableX402r.rule() (stores ruling)
Arbiter -> kleros.approve()   -> ArbitrableX402r.executeRuling -> RefundRequest.approve/deny
```

The contract splits `rule()` (stores) from `executeRuling()` (acts) so Kleros can't get stuck if the protocol call reverts. The plugin merges both into a single `approve()`/`deny()` call.

Evidence is submitted to two channels: x402r's on-chain evidence contract (queryable via SDK) and `ArbitrableX402r` (emits ERC-1497 `Evidence` events for the Kleros juror UI). The plugin handles both in a single `submitEvidence()` call.

## Contracts

| Contract | Purpose |
|----------|---------|
| `ProtocolArbitrable` | Abstract base — `rule()`, `submitEvidence()`, dispute storage |
| `ArbitrableX402r` | x402r logic — `createDispute()` links to refund data, `executeRuling()` calls approve/deny |

## Setup

Requires: Node.js 18+, pnpm, Foundry, Arb Sepolia ETH + USDC, Pinata JWT.

```bash
pnpm install
pnpm run build              # forge build + generate typed ABI

# Create env files for each role (use the same key for demo, or different keys)
cp .env.payer.example .env.payer
cp .env.merchant.example .env.merchant
cp .env.arbiter.example .env.arbiter
# Edit each with PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC, PINATA_JWT

pnpm run setup              # deploy ArbitrableX402r + marketplace operator
```

## Usage

```bash
pnpm run client             # payer: sign auth + authorize + kleros.request()
pnpm run merchant           # merchant: review evidence + counter-evidence
pnpm run arbiter 1          # arbiter: approve (1) or deny (2)
```

Each script reads from its own `.env.<role>` file. For the demo, all three can use the same private key. For multi-wallet testing, put different keys in each file.

## Plugin API

```typescript
const client = createPayerClient(config).extend(klerosActions(klerosConfig))

// request refund + Kleros dispute + evidence
await client.kleros.request(paymentInfo, amount, nonce, evidence?)

// approve/deny — handles ruling (testnet) + execution in one call
await client.kleros.approve(localDisputeID, arbitratorDisputeID, paymentInfo)
await client.kleros.deny(localDisputeID, arbitratorDisputeID, paymentInfo)

// dual-channel evidence (x402r + ArbitrableX402r for Kleros UI)
await client.kleros.submitEvidence(paymentInfo, nonce, evidence, arbitratorDisputeID?)

// reads
await client.kleros.getEvidence(paymentInfo, nonce)
await client.kleros.getRuling(arbitratorDisputeID)
await client.kleros.getDispute(localDisputeID)
```

`KlerosConfig` takes optional `ipfsUploader`/`ipfsFetcher` — only needed for evidence operations.

## Scripts

| Script | What it does |
|--------|-------------|
| `build` | `forge build` + generate typed ABI from Foundry artifact |
| `setup` | Deploy ArbitrableX402r, set Ruler to manual mode, deploy marketplace operator |
| `client` | Sign + submit authorization, call `kleros.request()` |
| `merchant` | Review evidence, submit counter-evidence |
| `arbiter` | Review evidence, `kleros.approve()` or `kleros.deny()` |
| `deploy-ruler` | Deploy KlerosCoreRuler (shared infra, rarely needed) |

## Notes

- **Testnet only** — uses KlerosCoreRuler (mock). On mainnet, jurors vote and `approve()`/`deny()` skip the ruling step automatically.
- **ABI generation** — `pnpm run build` compiles contracts and generates `src/kleros-plugin/generated.ts` from the Foundry artifact. Re-run after contract changes.
- **300s escrow** — real Kleros disputes take days. Production needs longer escrow or a freeze condition.
- **`evm_version = "paris"`** — Arb Sepolia lacks PUSH0. Remove from `foundry.toml` for chains that support it.
