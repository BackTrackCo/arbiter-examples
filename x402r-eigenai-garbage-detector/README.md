# x402r + EigenAI Garbage Detection Example

Example showing how to build a garbage detection arbiter for x402r refundable payments using [EigenAI](https://eigenai.xyz) deterministic inference.

**Chain:** Base Sepolia (84532)

## Architecture

```
Client → Merchant → x402 Middleware
  ├── handler runs → 200 + response body
  ├── x402 settles (escrow authorize via facilitator)
  ├── onAfterSettle hook: POST response body to arbiter (fire-and-forget)
  ├── Response delivered to client
  │
  └── Arbiter (async, EigenAI):
      ├── NOT garbage → PASS (arbiter can call release())
      └── IS garbage → FAIL (does nothing → escrow expires → auto-refund)
```

**On-chain enforcement:** The `PaymentOperator`'s release condition is `StaticAddressCondition(arbiter)` — only the arbiter address can call `release()`. If the arbiter detects garbage and does nothing, the escrow period expires and anyone can call `refundInEscrow()` for automatic refund.

**Deterministic verification:** EigenAI runs inference with a locked seed, so anyone can replay the exact same prompt + seed and get the same verdict. A keccak256 commitment hash (`prompt + response + seed`) provides an audit trail.

## Prerequisites

- Node.js 18+
- Wallet with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) — select Base Sepolia)

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages
> (not npm) because the published `@x402r/core@0.1.0` hasn't been updated with
> unified CREATE3 addresses yet. Run `pnpm build` in `x402r-sdk/` first.

## Running

### 1. Deploy operator

Deploys a `PaymentOperator` with `StaticAddressCondition(arbiter)` as the release gate:

```bash
pnpm deploy
# Copy the OPERATOR_ADDRESS to .env
```

### 2. Start arbiter

Runs the garbage detection service (uses EigenAI for content evaluation):

```bash
pnpm arbiter
```

### 3. Start merchant

Runs a merchant server with x402 payment middleware and the `forwardToArbiter` hook:

```bash
# Requires a facilitator running (see x402r-arbiter-eigencloud for facilitator setup)
FACILITATOR_URL=http://localhost:4022 pnpm merchant
```

### 4. Run client

Makes paid requests through the x402 flow and checks arbiter verdicts:

```bash
pnpm client
```

## Key files

| File | Purpose |
|------|---------|
| `src/arbiter.ts` | Express server: POST /verify, GET /verdict/:tx, GET /health |
| `src/garbage-detector.ts` | EigenAI prompt + response parsing + commitment hashing |
| `src/eigenai-client.ts` | Wallet-signed grant auth for EigenAI API |
| `src/hook.ts` | `forwardToArbiter()` — onAfterSettle hook factory |
| `src/merchant.ts` | Merchant with x402 middleware + garbage detection hook |
| `src/client.ts` | Client: pay via x402 flow, poll verdicts |
| `src/scripts/1-deploy-operator.ts` | Deploy delivery protection operator |

## Operator condition layout

| Slot | Condition | Effect |
|------|-----------|--------|
| `releaseCondition` | `StaticAddressCondition(arbiter)` | Only arbiter can release funds |
| `authorizeRecorder` | `EscrowPeriod` | Tracks when authorize happened |
| `refundInEscrowCondition` | `EscrowPeriod` | Anyone can refund after escrow window |
| `refundPostEscrowCondition` | `Receiver` | Receiver can refund post-escrow |
