# x402r + EigenAI Garbage Detection Example

Garbage detection arbiter for x402r refundable payments using [EigenAI](https://eigenai.xyz) deterministic inference and the `.extend(garbageDetectorActions(config))` plugin pattern.

## Quick Start

```bash
pnpm run setup              # deploy operator (one-time)
pnpm run arbiter            # start garbage detection service
pnpm run merchant           # start merchant with payment middleware (separate terminal)
pnpm run client             # make paid requests and check verdicts (separate terminal)
```

## Architecture

Three systems work together: x402r (payment escrow), EigenAI (content evaluation), and x402 middleware (HTTP payment flow).

**x402r (on-chain)** -- USDC payment flows into `AuthCaptureEscrow`, managed by `PaymentOperator`. `StaticAddressCondition(arbiter)` gates release -- only the arbiter can release escrowed funds. `EscrowPeriod` gates refund -- if arbiter does nothing, funds auto-refund after the escrow window.

**EigenAI (off-chain)** -- Deterministic LLM inference with a locked seed. The arbiter evaluates HTTP response bodies against a garbage detection prompt. A keccak256 commitment hash (prompt + response + seed) makes every evaluation verifiable -- anyone can replay the same inputs and get the same verdict.

**x402 middleware (HTTP)** -- `onAfterSettle` hook forwards the response body to the arbiter after each successful settlement. Fire-and-forget -- does not block the client response. Merchant also signs EIP-712 receipts (offer-receipt extension) so clients have cryptographic proof of what was delivered.

### Flow

1. **Client** sends a paid request through x402 middleware -- `wrapFetchWithPayment` handles the 402 → sign → retry flow
2. **Merchant** serves the response, x402 settles the escrow payment via facilitator, signs an EIP-712 receipt (delivery proof)
3. **Hook** fires `forwardToArbiter()` which POSTs the response body to the arbiter (async, fire-and-forget)
4. **Arbiter** evaluates the response via EigenAI:
   - **PASS** -- calls `sdk.garbageDetector.release(paymentInfo)` to release escrowed funds to merchant
   - **FAIL** -- does nothing, escrow period expires, anyone calls `refundInEscrow()` for automatic refund

## Prerequisites

- Node.js 18+
- Wallet with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Base Sepolia)

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages.
> Run `pnpm build` in `x402r-sdk/` first if you haven't already.

## The Plugin

`.extend(garbageDetectorActions(config))` adds garbage detection methods to any x402r client:

```typescript
import { garbageDetectorActions } from './garbage-detector-plugin.js'
import { EigenAIClient } from './eigenai-client.js'

const sdk = createX402r({ ... }).extend(
  garbageDetectorActions({
    eigenai: new EigenAIClient(account, grantServer, model),
    seed: 42,
  })
)
```

| Method | Description |
|--------|-------------|
| **`evaluate(responseBody)`** | Run EigenAI garbage detection, return verdict + commitment |
| **`release(paymentInfo, amount?)`** | Release escrowed funds (arbiter calls on PASS) |
| **`evaluateAndRelease(responseBody, paymentInfo, amount?)`** | Evaluate + release in one call |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run setup` | Deploy PaymentOperator + conditions (one-time) |
| `pnpm run arbiter` | Start garbage detection service (long-running) |
| `pnpm run merchant` | Merchant with EIP-712 receipts (needs wallet) |
| `pnpm run merchant:jws` | Merchant with JWS receipts (no wallet needed) |
| `pnpm run client` | Make paid requests through x402 flow |

## Limitations

- **In-memory verdict store** -- verdicts are lost on arbiter restart (a production arbiter would persist to a database)
- **Workspace package links** -- `@x402r/core` and `@x402r/sdk` link to workspace source, not npm
- **Same wallet** -- example uses the same private key for arbiter, merchant, and client (in production these would be separate)

## Contracts

### x402r (deployed per-operator via `pnpm run setup`)

| Contract | Role |
|----------|------|
| PaymentOperator | Authorize, release, refund payments |
| EscrowPeriod | Time-lock condition on funds |
| StaticAddressCondition | Gates release to arbiter address only |
