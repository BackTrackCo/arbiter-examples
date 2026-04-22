import { toClientEvmSigner } from "@x402/evm";
import { CommerceEvmScheme } from "@x402r/evm/commerce/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes } from "viem";
import { CHAIN_ID } from "../config.js";

// ---------------------------------------------------------------------------
// E2E test: payment flow, arbiter verdicts, and payload verification
//
// If CLIENT_PRIVATE_KEY is not set, falls back to the same wallet with delays.
// ---------------------------------------------------------------------------

const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:4021";
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";

const clientKey = (process.env.CLIENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY) as `0x${string}`;
if (!clientKey) throw new Error("PRIVATE_KEY or CLIENT_PRIVATE_KEY required");
const sameWallet = !process.env.CLIENT_PRIVATE_KEY;

const account = privateKeyToAccount(clientKey);
const clientSigner = toClientEvmSigner(account);
const client = new x402Client();
client.register(`eip155:${CHAIN_ID}`, new CommerceEvmScheme(clientSigner));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

async function waitForVerdictCount(target: number, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await (await fetch(`${ARBITER_URL}/health`)).json() as any;
    if (health.verdictCount >= target) return health.verdictCount;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for ${target} verdicts`);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

async function settleDelay() {
  if (sameWallet) {
    console.log("  Waiting for tx to settle (shared wallet)...");
    await new Promise((r) => setTimeout(r, 8000));
  }
}

async function main() {
  console.log(`Client: ${account.address}`);
  console.log(`Same wallet: ${sameWallet}\n`);

  const healthBefore = await (await fetch(`${ARBITER_URL}/health`)).json() as any;
  const v0 = healthBefore.verdictCount;
  console.log(`Initial verdicts: ${v0}`);

  // -----------------------------------------------------------------------
  // Test 0: Cold-agent 402 shape (body + Link header, before any payment)
  // -----------------------------------------------------------------------
  console.log("\n=== Test 0: Cold-agent 402 shape ===");
  const r0 = await fetch(`${MERCHANT_URL}/weather`);
  assert(r0.status === 402, `402 on unpaid request (got ${r0.status})`);
  assert(
    r0.headers.get("Link") === `<https://docs.x402r.org>; rel="help"`,
    `Link: rel=help header present`,
  );
  const body0 = await r0.json() as any;
  assert(
    typeof body0?.help === "string" && body0.help.includes("docs.x402r.org"),
    `help body present (got ${JSON.stringify(body0)})`,
  );

  // -----------------------------------------------------------------------
  // Test 1: /weather (valid content) -> PASS -> release
  // -----------------------------------------------------------------------
  console.log("\n=== Test 1: /weather (valid content) ===");
  const r1 = await fetchWithPayment(`${MERCHANT_URL}/weather`);
  assert(r1.status === 200, `Status 200 (got ${r1.status})`);
  const body1 = await r1.json() as any;
  const body1Str = JSON.stringify(body1);
  assert(!!body1.location, `Response has weather data`);
  const tx1 = r1.headers.get("x-payment-transaction");

  await settleDelay();
  await waitForVerdictCount(v0 + 1);

  // -----------------------------------------------------------------------
  // Test 2: /garbage (error content) -> FAIL -> immediate refund
  // -----------------------------------------------------------------------
  await settleDelay(); // let release tx confirm before next payment
  console.log("\n=== Test 2: /garbage (garbage content) ===");
  const r2 = await fetchWithPayment(`${MERCHANT_URL}/garbage`);
  assert(r2.status === 200, `Status 200 (got ${r2.status})`);
  const body2 = await r2.json() as any;
  const body2Str = JSON.stringify(body2);
  assert(body2.error === "Internal Server Error", `Response is error JSON`);
  const tx2 = r2.headers.get("x-payment-transaction");

  await settleDelay();
  await waitForVerdictCount(v0 + 2);

  // -----------------------------------------------------------------------
  // Test 3: Client verifies arbiter saw the same payload (anti-cheating)
  //
  // A malicious merchant could forward different content to the arbiter
  // than what the client received. The client checks by:
  //   1. Hashing the response body they received
  //   2. Asking the arbiter for the responseBodyHash it stored
  //   3. Comparing the two
  // -----------------------------------------------------------------------
  console.log("\n=== Test 3: Payload verification (anti-cheating) ===");

  // Find the verdicts by polling (tx hash may be null in some x402 versions)
  // Use the /health endpoint to get verdict count, then try known tx hashes
  // For this test, we use the /verdict/:tx/payload endpoint

  // Get all verdict tx hashes by checking the arbiter's stored verdicts
  // The arbiter stores by settlement tx hash. We need those hashes.
  // Since x-payment-transaction may be null, let's get them from payment-response header.
  const paymentResponse1 = r1.headers.get("payment-response") ?? r1.headers.get("x-payment-response");
  const paymentResponse2 = r2.headers.get("payment-response") ?? r2.headers.get("x-payment-response");

  let settleTx1: string | null = tx1;
  let settleTx2: string | null = tx2;

  if (!settleTx1 && paymentResponse1) {
    try {
      const parsed = JSON.parse(atob(paymentResponse1));
      settleTx1 = parsed.transaction ?? null;
    } catch {}
  }
  if (!settleTx2 && paymentResponse2) {
    try {
      const parsed = JSON.parse(atob(paymentResponse2));
      settleTx2 = parsed.transaction ?? null;
    } catch {}
  }

  if (settleTx1) {
    console.log(`  Settlement tx 1: ${settleTx1}`);
    const verdictRes = await fetch(`${ARBITER_URL}/verdict/${settleTx1}`);
    assert(verdictRes.ok, `Verdict 1 found`);
    const verdict1 = await verdictRes.json() as any;
    assert(verdict1.verdict === "PASS", `Verdict 1 is PASS (got ${verdict1.verdict})`);

    // Verify payload hash matches what client received
    const clientHash = keccak256(toBytes(body1Str));
    assert(
      verdict1.responseBodyHash === clientHash,
      `Payload hash matches (arbiter saw same content)`,
    );

    // Test unauthenticated payload request (should be rejected)
    const unauthRes = await fetch(`${ARBITER_URL}/verdict/${settleTx1}/payload`);
    assert(unauthRes.status === 401, `Payload endpoint rejects unauthenticated requests`);

    // Test authenticated payload retrieval (payer signs tx hash)
    const payloadMessage = `x402r:payload:${settleTx1}`;
    const payloadSig = await account.signMessage({ message: payloadMessage });
    const payloadRes = await fetch(`${ARBITER_URL}/verdict/${settleTx1}/payload`, {
      headers: { Authorization: payloadSig },
    });
    assert(payloadRes.ok, `Payload endpoint accepts payer signature`);
    const payload1 = await payloadRes.json() as any;
    assert(payload1.responseBody === body1Str, `Full payload matches client response`);
  } else {
    console.log("  Skipping payload verification for test 1 (no settlement tx hash)");
  }

  if (settleTx2) {
    console.log(`  Settlement tx 2: ${settleTx2}`);
    const verdictRes = await fetch(`${ARBITER_URL}/verdict/${settleTx2}`);
    assert(verdictRes.ok, `Verdict 2 found`);
    const verdict2 = await verdictRes.json() as any;
    assert(verdict2.verdict === "FAIL", `Verdict 2 is FAIL (got ${verdict2.verdict})`);

    const clientHash = keccak256(toBytes(body2Str));
    assert(
      verdict2.responseBodyHash === clientHash,
      `Payload hash matches (arbiter saw same content)`,
    );
  } else {
    console.log("  Skipping payload verification for test 2 (no settlement tx hash)");
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const healthAfter = await (await fetch(`${ARBITER_URL}/health`)).json() as any;
  console.log(`\n=== Results ===`);
  console.log(`Verdicts: ${v0} -> ${healthAfter.verdictCount}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
