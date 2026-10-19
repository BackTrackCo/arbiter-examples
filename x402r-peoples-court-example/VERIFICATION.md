# Fresh Base Sepolia verification — October 19, 2026

The proposed example completed a fresh synthetic 0.01 test-USDC payment, refund request, evidence submission, authenticated referral, receiver-signed Answer, real-provider adjudication, Award service, and confirmed on-chain `void` returning the full amount to the payer.
The service ran locally with waived filing fees and its supported synthetic test clock accelerated the post-service wait.
This verifies the local integration and live testnet executor path; it does not verify hosted onboarding or natural seven-day timing.

Machine-readable, deliberately allowlisted results: [verification-2026-10-19.json](verification-2026-10-19.json).
Environment files, capabilities, signed authorizations, signatures, raw case responses, logs, evidence, and Award contents are excluded.

## Provenance and isolation

- Example code commit: `2aeb7838ef133cef17633d123eab4208c2263ba5`. This verification update changes documentation only.
- Service source commit: `126618f6590e6e09484c2934a08ae54ebbdf5313`; a new build and a new isolated local JSON database were used.
- Node: `v22.23.2`; locked example dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund`.
- Example package-lock SHA-256: `6a1eab07ae4f9802fde8d50da322c89f356a30e3960f002eaf676e8ffc127ec3`.
- Chain: RPC-reported `84532`, Base Sepolia. Canonical test USDC amount: `10000` base units.
- Existing deterministic 31-day operator reused: `0x80754BA4594aF01726ee8ce80F30B5362227eca7`. No new contract deployment.
- Terms hash: `518669710687625d2c6260229475a23eef322879c607a0bd73fb588cbf113f1a`; checked against the exact bundled tuple and bound into the payer’s signature before payment.
- A new payment nonce, example state, case, admin/worker capabilities, and isolated local store were used. Prior cases were not resumed.
- Dedicated operator-controlled payer and merchant wallets were allowlisted, and the case was designated as synthetic verification before adjudication.
- The assigned procedure completed on attempt 1 with 1 real model call and 4455 total tokens. No model result or chain success was mocked.

## Independently checked chain receipts

PaymentInfo hash: `0x036ea7a6aa8289ef726e7d3dadda270341afcd405bf10cee892f1431c039cf1b`.

| Step | Successful Base Sepolia transaction | Block | Block time UTC |
|---|---|---|---|
| authorization | [0x0cf7bbacada54e7e3aff63a77f9c30b99b62ad1d5e2f2c8d3b25586e4a28db78](https://sepolia.basescan.org/tx/0x0cf7bbacada54e7e3aff63a77f9c30b99b62ad1d5e2f2c8d3b25586e4a28db78) | 48329495 | 2026-10-19T16:27:58.000Z |
| refundRequest | [0x673139564e101464b3ea3d246c682dbfd537e1cd3dee8f7b7585ca07698b2b7f](https://sepolia.basescan.org/tx/0x673139564e101464b3ea3d246c682dbfd537e1cd3dee8f7b7585ca07698b2b7f) | 48329502 | 2026-10-19T16:28:12.000Z |
| evidence | [0x6df7992c0d5939ae6e057e09120df5da2bdf8e39090fc8fc5ec5cf394989b26c](https://sepolia.basescan.org/tx/0x6df7992c0d5939ae6e057e09120df5da2bdf8e39090fc8fc5ec5cf394989b26c) | 48329504 | 2026-10-19T16:28:16.000Z |
| settlement | [0x22f8738b69c482523e476257c7542f626d94ee2bfb8734d1b7341c3d647c0a76](https://sepolia.basescan.org/tx/0x22f8738b69c482523e476257c7542f626d94ee2bfb8734d1b7341c3d647c0a76) | 48329543 | 2026-10-19T16:29:34.000Z |

The settlement transaction emitted `PaymentVoided` for this payment and `10000` base units.
The canonical USDC transfer logs independently show `10000` base units returned to the payer.
A fresh SDK payment-state read found zero remaining capturable amount and zero refundable amount.
The service recorded `final_release_executed` with test provenance.
No direct wallet settlement helper was used.

## Served artifacts and supported test clock

The served Award manifest’s SHA-256 was recomputed, and its EIP-191 signature was verified against the configured arbiter’s derived public address.
Party-authenticated PDF, DOCX, and original JSON downloads through `/api/cases/{id}/award?format={pdf|docx|json}` matched the signed manifest’s exact byte lengths and SHA-256 hashes.
The manifest, signature, revision, release timestamp, and original execution date were unchanged after clock advancement and settlement.

- Service time: `2026-10-19T16:29:05.993Z`.
- Original execution date: `2026-10-26T16:29:05.993Z` — seven days after service.
- Synthetic clock offset: `604784000` milliseconds.
- The authenticated supported test-clock endpoint recorded the designation and Award-bound advance. The normal proceeding sweep recorded test-clock admission and invoked the existing settlement executor.
- No direct database edit, on-chain time change, shortened escrow, or rewritten served deadline was used.

The completed exchange was closed through the operator API after both synthetic parties filed.
This exercised the completed-record operator path rather than waiting through the ordinary briefing period.
The test clock accelerated only the post-service wait; appeal and other lifecycle holds remained enforced by the normal executor.
No appeal was filed in this run.

## Commands and limits

With a privately provisioned local operator registration and `.env`, the public example commands were:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run setup
npm run merchant
# In a second terminal:
npm run client
npm run refund
npm run refer
npm run answer
npm run observe
```

Between referral and adjudication, the service operator designated the synthetic case; after both filings, it closed the completed exchange and processed the queued run with the normal worker.
After service, it used the authenticated test-clock advance and normal proceeding sweep.
Those service-side controls are separate from this merchant/payer example and require operator access.
The four offline example checks, service build, and focused test-clock regressions passed.

Hosted access, paid filing fees, external notice relay, natural briefing/stay timing, appeals, merchant capture, split allocations, and watcher delivery/recovery remain unverified by this run.
This is one controlled synthetic integration exercise, not customer volume or a general adjudication-quality benchmark.

An additional API check found that the separate exact-money JSON projection at `/api/cases/{id}/award/artifacts/json` returned HTTP 500 for this USDC case because that projection currently supports USD values only.
The original served JSON download through the `format=json` route passed its signed-byte checks, as did PDF and DOCX.
No application change was made to conceal or bypass that projection limitation.
