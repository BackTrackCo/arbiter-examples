# x402r Schema Check Example

Deterministic delivery protection arbiter for x402r refundable payments. The merchant publishes rules for what a paid response must look like; the arbiter checks every response against them and releases the escrow on PASS or refunds the payer on FAIL. No model is asked anything: the same response and the same rules always give the same verdict, and anyone holding the response can confirm it.

It is the third kind of arbiter next to the [AI garbage detector](../x402r-ai-garbage-detector) and [Kleros](../x402r-kleros-example), for the case the [Delivery Protection docs](https://docs.x402r.org/sdk/overview) call "schema validation or quality checks".

## Quick Start

```bash
pnpm run setup              # deploy operator (one-time)
pnpm run arbiter            # start the schema-check arbiter
pnpm run merchant           # start merchant with payment middleware (separate terminal)
pnpm run client             # make paid requests, check verdicts and receipts (separate terminal)
```

What success looks like per step:

- **setup** writes the deployed addresses to `context.json` and prints the operator address
- **arbiter** prints `[arbiter] Schema-check arbiter on :3001` plus its address, chains, checker URL and rules file
- **merchant** prints `[merchant] Running on :4021` with the pay-to and operator addresses
- **client** pays `/forecast` (expect `PASS`, then `Captured: 0x...` in the arbiter logs) and `/forecast-broken` (expect `FAIL` with the rules it broke, then `refunded: 0x...`). For each verdict it then reads the public receipt and prints `log says pass|fail; body matches the receipt: true`

## The Rules

The arbiter judges every response against `spec.json`, published before any payment and advertised in the 402 response through `/attest/identity`, so a client can read what it is paying for before it pays:

```json
{
  "kind": "json-array",
  "length": 3,
  "item_keys": ["day", "high", "low", "unit"],
  "allowed": [{ "field": "unit", "values": ["C", "F"] }]
}
```

`/forecast` returns three days with every key and a Celsius unit: PASS. `/forecast-broken` returns something that looks like data and is not what was paid for (two days, a missing key, a unit of `K`): FAIL, with the reason naming each broken rule:

```
exactly 3 elements: 2; every element is an object with day, high, low, unit: missing #2.low, #2.unit;
unit is one of "C", "F": 1 outside, first at element #1 (a string not in the list); ...
```

The grammar is small on purpose: an exact length or a min and max, keys every element must carry, distinct values of a field, allowed values of a field, and minimum occurrences of a value. It is published at [ergonia.works/api/verifiers/schema-check](https://ergonia.works/api/verifiers/schema-check). One limitation to know: version 1 judges JSON arrays only, so an endpoint returning a single object would wrap it or need a different arbiter.

## Architecture

**x402r (on-chain)** -- identical to the garbage detector: USDC flows into `AuthCaptureEscrow`, managed by `PaymentOperator`. Release requires arbiter OR payer; refund-in-escrow can be triggered by the arbiter immediately, by the receiver, or by anyone after the escrow window.

**Schema check (off-chain)** -- the arbiter sends the response body and the rules to [Ergonia](https://ergonia.works)'s `POST /api/check`, which returns PASS or FAIL with every finding and chains the verdict in a public, append-only log: the rules, the SHA-256 of the body and the findings. The body itself is not published there, and no finding quotes it.

### Flow

1. **Client** sends a paid request through x402 middleware
2. **Merchant** serves the response, x402 settles the escrow payment via facilitator
3. **Hook** fires `forwardToArbiter()` which POSTs the response body to the arbiter
4. **Arbiter** checks the body against `spec.json`:
   - **PASS** -- `sdk.schemaCheck.capture(paymentInfo)` releases escrowed funds to the merchant
   - **FAIL** -- `sdk.payment.voidPayment(paymentInfo)` refunds the payer immediately
   - **No verdict** (checker unreachable, key refused) -- no on-chain action at all; the escrow window then returns the funds to the payer. An unreachable checker is never read as a PASS.
5. **Anyone** can confirm the verdict without trusting the arbiter: read the receipt, check its `artifact_sha256` equals the SHA-256 of the body they hold, and read the verdict from the log. `confirmReceipt()` in [`src/schema-check.ts`](src/schema-check.ts) does exactly that and the client runs it.

## Trust Model

Disclosure first: this example was written by the people who run Ergonia, the checker it calls.

What a verdict proves, and what it does not:

- **Deterministic.** The same rules and the same body give the same findings, every time. There is no seed, temperature or model version to argue about.
- **Replayable by anyone holding the body.** The receipt records the rules and the body's hash. The payer and the merchant both hold the body; either can re-run the check.
- **Tamper-evident, not independently witnessed.** The log is hash-chained and re-verifies at [`/api/attest`](https://ergonia.works/api/attest), with a daily checkpoint published to a separate repository. All of it is run by one owner, so it detects a quiet rewrite of the past; it is not a second, independent party.
- **Shape, not truth.** The arbiter proves the response has the shape the merchant promised. It says nothing about whether Monday's forecast was right.

## Prerequisites

- Node.js 22+
- Wallet with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Base Sepolia)
- An Ergonia key for the arbiter. Registration is free and takes one call:

```bash
curl -X POST https://ergonia.works/api/register \
  -H 'content-type: application/json' \
  -d '{"handle":"my-arbiter","model":"none"}'
# keep the erg_sk_... secret it returns: it is shown once
```

```bash
pnpm install
cp .env.arbiter.example .env.arbiter      # PRIVATE_KEY and ERGONIA_KEY
cp .env.merchant.example .env.merchant
cp .env.client.example .env.client
# Fill in PRIVATE_KEY in each. Operator addresses are read automatically
# from the context.json written by `pnpm run setup`.
```

The `.gitignore` here ignores every `.env.*` except the templates, since each of them holds a private key.

## The Plugin

`.extend(schemaCheckActions(settings))` adds the check to any x402r client:

```typescript
import { schemaCheckActions } from './schema-check-plugin.js'
import { loadSchemaCheckSettings } from './config.js'

const sdk = createX402r({ ... }).extend(schemaCheckActions(loadSchemaCheckSettings()))
```

| Method | Description |
|--------|-------------|
| **`evaluate(responseBody)`** | Check the body against the rules; return verdict, failing rules and public receipt. Throws when no verdict could be obtained |
| **`capture(paymentInfo, amount?)`** | Capture escrowed funds (arbiter calls on PASS) |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run setup` | Deploy PaymentOperator + conditions (one-time) |
| `pnpm run arbiter` | Start the schema-check arbiter (long-running) |
| `pnpm run merchant` | Merchant server |
| `pnpm run client` | Make paid requests through x402 flow, then confirm each receipt |
| `./src/scripts/pay-via-cli.sh` | Pay from the shell via `@x402r/cli` (defaults to `/forecast`) |

## Dependencies

The versions are pinned to what npm actually serves today. The `^0.3.0` ranges for `@x402r/sdk`, `@x402r/core` and `@x402r/helpers` used elsewhere in this repository match no published release (the registry has `0.2.x` and `0.3.0-alpha.0`, and a caret range never selects a prerelease), and the latest `@x402/*` 2.x no longer type-checks against `@x402r/evm@0.2.0-alpha.1`, which was built on 2.14. With these pins `pnpm install` and `pnpm run typecheck` pass from a clean checkout.

## What Was Tested

- `pnpm run typecheck` from a clean install.
- The whole off-chain path against the live checker: an arbiter started locally with `ERGONIA_URL=https://ergonia.works`, `/verify` on both bodies (PASS and FAIL with the expected reasons), the stored verdicts, `confirmReceipt()` on each public receipt (verdict read from the log, body hash matching), the body absent from the log, a 502 with no stored verdict and no on-chain action when the checker is unreachable, and the rules published by `/attest/identity`.
- **Not re-run here:** the on-chain capture and void on Base Sepolia. That code is the garbage detector's, unchanged; only the decision that precedes it differs.

## Limitations

- **File-based verdict store** -- verdicts persist as JSON files in `VERDICTS_DIR` (a production arbiter would use a database)
- **Same wallet** -- example uses the same private key for arbiter, merchant, and client (in production these would be separate)
- **JSON arrays only** -- schema-check@1 judges JSON arrays; other response shapes need a different arbiter
- **External checker** -- the verdict comes from Ergonia's API (200 checks per key per day); if it is unreachable no verdict is given and the escrow window refunds the payer
