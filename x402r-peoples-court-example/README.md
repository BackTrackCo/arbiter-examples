# People’s Court arbiter example

This example connects an x402r refund dispute to [People’s Court](https://peoplescourt.ai), an independent arbitration forum that returns a written, reasoned award from the agreement and both parties’ submissions.
It demonstrates the AI-only referral route on **Base Sepolia** using separate merchant and payer wallets.
The arbitration terms preserve a human appeal route; this example does not waive it.

Like the Kleros and AI garbage-detector examples, it provides a standalone package with operator setup, a merchant, a payer, and a refund workflow.
People’s Court operates the arbiter service and its settlement executor separately.
You supply the two test wallets, not an arbiter signing key.

## Before running

Use Node **22.23.2 or later** and npm.
Use dedicated disposable testnet wallets with Base Sepolia ETH for gas and at least **0.01 test USDC** in the payer wallet.
Any filing fee is quoted and paid separately from the disputed payment.
The example rejects other chains and checks that the RPC reports chain ID `84532` before signing or broadcasting.

**Hosted access requires onboarding.**
Contact [contact@peoplescourt.ai](mailto:contact@peoplescourt.ai) to obtain a confirmed Base Sepolia API endpoint, the public arbiter address, operator/terms registration, and a private integration credential.
The bundled `arbitration-terms.json` is a pinned example snapshot, not a promise that every hosted deployment accepts that tuple.
The service operator must register the exact PaymentOperator and complete terms tuple before payment.
If a different snapshot is required, obtain and review the complete tuple and its matching hash together.
Do not direct a testnet run to an unconfirmed production endpoint.

## Install and configure

Run commands from this directory:

```bash
npm ci --ignore-scripts
cp .env.example .env
chmod 600 .env
```

Fill in `.env` locally with the merchant and payer test keys, RPC, public arbiter address, confirmed API URL, and provisioned `X402R_WEBHOOK_SECRET`.
Keep every real credential out of commits, issues, PRs, screenshots, and logs.
The default API URL is a separately operated local service at `http://localhost:3418`; this package does not start that service.
For a hosted service use its confirmed HTTPS URL.
The merchant listens on loopback port `4021` by default.

Dependencies are pinned with an npm lockfile.
The x402r packages use published alpha versions matched to the source kit; do not substitute unpublished stable ranges.

## 1. Prepare the operator

```bash
npm run setup
```

Setup previews the deterministic 31-day delivery-protection operator and verifies existing contracts.
If infrastructure is missing, it stops and prints the proposed public addresses.
After reviewing those addresses, you can explicitly deploy on Base Sepolia:

```bash
npm run setup -- --execute
```

The merchant deploys the permissionless operator and arbiter-keyed refund infrastructure with its own wallet.
An existing `X402R_OPERATOR_ADDRESS` must match the expected merchant, arbiter, and 31-day preset.
Setup verifies deployed code, capture/void conditions, and hold duration, then saves private local state.
Give the service operator only the nonsecret registration configuration printed by setup.

## 2. Run the merchant and payer

In one terminal:

```bash
npm run merchant
```

In another:

```bash
npm run client
```

The merchant’s `/resource` route serves an auth-capture challenge for 0.01 test USDC.
It embeds the SDK facilitator so a separate facilitator wallet is unnecessary.
The payer binds the disclosed arbitration terms by setting `PaymentInfo.salt` to the terms hash **before** signing the ERC-3009 authorization.
A stock random-salt client does not provide the payment-time consent this integration requires.
The authorization stays open for the arbiter’s eventual capture or void.

The paid response intentionally omits the promised numeric temperature, creating a disclosed test fixture.
It is not a real customer dispute or a claim about service quality.
The client saves the signed payment, actual response, and receipt privately under `.state/`.

## 3. Request a refund and refer the dispute

Review `claim.json` and `answer.json` so they describe the response actually purchased.
Then run:

```bash
npm run refund
npm run refer
```

The payer signs the on-chain refund request and submits the small test exhibit as a JSON data URI.
**That evidence is public on-chain: use only the supplied non-sensitive test fixture.**
The referral reads the authorization time and hold duration from the chain and authenticates the exact request bytes with the provisioned integration credential.
Case capabilities and the exact consent message are saved privately, not printed.

If the service returns a filing-fee challenge, review it before explicitly paying:

```bash
npm run fee
npm run fee -- --pay
```

This helper supports a separate Base Sepolia USDC fee, caps it at 100 test USDC, and preserves the receipt for retries.
It does not take fees from the disputed payment.
A fee-pending case is not yet docketed and does not start the Answer clock.

## 4. Answer and observe

```bash
npm run answer
npm run observe
```

The merchant signs the service’s exact consent message and files the reviewed Answer.
The helper does not reconstruct that message from an assumed Rules version.
On a fee-gated integration, arrange trusted operator delivery of the matching notice into `.state/notice.json`, or configure `ARBITRATION_NOTICE_ENDPOINT` through an operator-controlled HTTPS relay to the loopback `/notice` route.
The demonstration notice receiver is not an authenticated public webhook: keep it on loopback and do not expose it through an unrestricted tunnel.
Confirm the notice and intended case before running `answer`; use only the dedicated test wallet.

`observe` reads the case with the claimant capability and independently reads Base Sepolia payment state.
It does not execute an award or expose service administration.
Case processing, Award service, appeals, finality, and settlement remain the service operator’s responsibility.

## Settlement and timing

For an open authorization, a payer-win Award can produce `void()` and a merchant-win Award can produce `capture()` after applicable finality controls.
A post-capture refund is merchant-funded and uses a different flow; this example keeps its authorization open.
The service can refuse an unsupported or declined request without an unsupported funds transfer.
The example contains no command to force an Award, waive an appeal, shorten a stay, or execute settlement directly.

The bundled procedure uses a seven-day post-service stay and a minimum 30-day escrow hold; this example selects 31 days with longer capture/refund deadlines.
An appeal or another hold can outlast that window, at which point the protocol’s expiry behavior can govern independently of the Award.
Confirm the registered procedure and deadlines with the operator for the intended run.

## Checks and recovery

```bash
npm run check
```

The offline checks cover the terms-bound ERC-3009 signature and salt substitution, HMAC request bytes, chain/port restrictions, and fee/deadline guards.
They generate disposable signing material at runtime and make no chain transactions or hosted filings.
They do not prove hosted onboarding, fee collection, natural stay timing, appeals, or live settlement.

A [fresh October 19 Base Sepolia run](VERIFICATION.md) completed the local integration through a confirmed 0.01 test-USDC return to the payer.
That controlled synthetic run used a local service, waived filing fees, and the supported post-service test clock. Hosted access, paid fees, natural stay timing, and appeals remain unverified; the report also records a separate JSON projection limitation.

`.env`, `.state/`, dependencies, and logs are ignored by Git.
State files can contain signed authorizations, case capabilities, and notices; protect them as credentials.
The scripts preserve broadcast hashes and pending markers so an ambiguous outcome stops automatic rebroadcast.
Reconcile the saved state and chain receipts before retrying; do not delete a pending marker to start again.

This example is adapted from the Apache-2.0 [People’s Court x402r kit](https://github.com/shunhe-wang/peoples-court-x402-disputes/pull/33).
It includes no private service code, environment files, case dumps, or administration tools.
