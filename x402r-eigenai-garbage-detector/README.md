# x402r AI Garbage Detection Example

Garbage detection arbiter for x402r refundable payments. Supports multiple inference providers (OpenAI, Ollama for TEE, EigenAI) via the `.extend(garbageDetectorActions(config))` plugin pattern.

## Quick Start

```bash
pnpm run setup              # deploy operator (one-time)
pnpm run arbiter            # start garbage detection service
pnpm run merchant           # start merchant with payment middleware (separate terminal)
pnpm run client             # make paid requests and check verdicts (separate terminal)
```

## Architecture

Three systems work together: x402r (payment escrow), AI inference (content evaluation), and x402 middleware (HTTP payment flow).

**x402r (on-chain)** -- USDC payment flows into `AuthCaptureEscrow`, managed by `PaymentOperator`. `StaticAddressCondition(arbiter)` gates release -- only the arbiter can release escrowed funds. `EscrowPeriod` gates refund -- if arbiter does nothing, funds auto-refund after the escrow window.

**AI Inference (off-chain)** -- The arbiter evaluates HTTP response bodies against a garbage detection prompt. A keccak256 commitment hash (prompt + response + seed) makes every evaluation auditable. Three provider options:

| Provider | Best for | Determinism | Verifiability |
|----------|----------|-------------|---------------|
| **OpenAI-compatible** | Any model via OpenAI/OpenRouter/Together | Probabilistic (seed hint) | Commitment hash only |
| **Ollama** | EigenCloud TEE deployment | Deterministic on same hardware | TEE attestation + commitment |
| **EigenAI** | Legacy (currently unavailable) | Deterministic | Replay-verifiable |

**x402 middleware (HTTP)** -- `onAfterSettle` hook forwards the response body to the arbiter after each successful settlement. Fire-and-forget -- does not block the client response.

### Flow

1. **Client** sends a paid request through x402 middleware -- `wrapFetchWithPayment` handles the 402 -> sign -> retry flow
2. **Merchant** serves the response, x402 settles the escrow payment via facilitator, signs an EIP-712 receipt (delivery proof)
3. **Hook** fires `forwardToArbiter()` which POSTs the response body to the arbiter (async, fire-and-forget)
4. **Arbiter** evaluates the response via the configured provider:
   - **PASS** -- calls `sdk.garbageDetector.release(paymentInfo)` to release escrowed funds to merchant
   - **FAIL** -- does nothing, escrow period expires, anyone calls `refundInEscrow()` for automatic refund

## Inference Providers

Set `INFERENCE_PROVIDER` in `.env`:

### OpenAI-compatible (default)

Works with any OpenAI-compatible API: OpenAI, OpenRouter, Together, vLLM, LiteLLM, etc.

```env
INFERENCE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini    # optional, default gpt-4o-mini
```

Via OpenRouter (access Claude, Llama, Mistral, etc. with one API key):

```env
INFERENCE_PROVIDER=openai
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-sonnet-4
```

### Ollama (local model -- best for EigenCloud TEE)

```env
INFERENCE_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b    # optional, default llama3.1:8b
OLLAMA_BASE_URL=http://localhost:11434  # optional
```

Running inside an EigenCloud TEE container gives full attestation coverage: the TEE proves the model, prompt, and decision logic all ran untampered. This is a stronger verifiability story than deterministic replay since it doesn't depend on bit-exact model reproducibility.

### EigenAI (legacy)

```env
INFERENCE_PROVIDER=eigenai
EIGENAI_GRANT_SERVER=https://determinal-api.eigenarcade.com
EIGENAI_MODEL=gpt-oss-120b-f16
```

> **Note:** EigenAI inference API is currently unavailable. The provider is kept for when/if access is restored.

## Prerequisites

- Node.js 18+
- Wallet with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia)) and USDC ([Circle faucet](https://faucet.circle.com/) -- select Base Sepolia)

```bash
pnpm install
cp .env.example .env
# Fill in PRIVATE_KEY + provider config
```

> **Note:** This example links to workspace `@x402r/core` and `@x402r/sdk` packages.
> Run `pnpm build` in `x402r-sdk/` first if you haven't already.

## The Plugin

`.extend(garbageDetectorActions(config))` adds garbage detection methods to any x402r client:

```typescript
import { garbageDetectorActions } from './garbage-detector-plugin.js'
import { OpenAICompatibleProvider } from './providers/openai.js'

const sdk = createX402r({ ... }).extend(
  garbageDetectorActions({
    provider: new OpenAICompatibleProvider({ apiKey: '...' }),
    seed: 42,
  })
)
```

| Method | Description |
|--------|-------------|
| **`evaluate(responseBody)`** | Run garbage detection, return verdict + commitment |
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
