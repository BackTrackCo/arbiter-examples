import { toClientEvmSigner } from "@x402/evm";
import { AuthCaptureEvmScheme } from "@x402/evm/auth-capture/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { CHAIN_ID } from "./config.js";
import { createClients } from "./scripts/shared.js";
import { confirmReceipt } from "./schema-check.js";

// ---------------------------------------------------------------------------
// Client: Make paid requests through the x402 flow
//
// Usage: pnpm run client
// ---------------------------------------------------------------------------

const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:4021";
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";

async function main() {
  const { account } = createClients();
  const networkId = `eip155:${CHAIN_ID}` as const;

  console.log(`Client: ${account.address}`);

  const clientSigner = toClientEvmSigner(account);
  const client = new x402Client();
  client.register(networkId, new AuthCaptureEvmScheme(clientSigner));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Keep each body as the exact text received: the receipt records its SHA-256.
  const bodies = new Map<Response, string>();

  // --- 1. Response that meets the rules ---
  console.log("\n1. Requesting /forecast (meets spec.json)...");
  const res1 = await fetchWithPayment(`${MERCHANT_URL}/forecast`);
  console.log(`  Status: ${res1.status}`);
  if (res1.ok) { bodies.set(res1, await res1.text()); console.log(`  Body: ${bodies.get(res1)}`); }

  // --- 2. Response that breaks the rules ---
  console.log("\n2. Requesting /forecast-broken (breaks spec.json)...");
  const res2 = await fetchWithPayment(`${MERCHANT_URL}/forecast-broken`);
  console.log(`  Status: ${res2.status}`);
  if (res2.ok) { bodies.set(res2, await res2.text()); console.log(`  Body: ${bodies.get(res2)}`); }

  // --- 3. Poll verdicts ---
  console.log("\n3. Polling arbiter verdicts...");
  const health = await (await fetch(`${ARBITER_URL}/health`)).json() as any;
  console.log(`  Total verdicts: ${health.verdictCount}`);

  // Give arbiter a moment to process the forwarded responses
  await new Promise((r) => setTimeout(r, 2000));

  for (const res of [res1, res2]) {
    const tx = res.headers.get("x-payment-transaction") ?? "unknown";
    const vRes = await fetch(`${ARBITER_URL}/verdict/${tx}`);
    if (vRes.ok) {
      const v = await vRes.json() as any;
      console.log(`  tx=${tx} → ${v.verdict} (${v.reason})`);
      // --- 4. Confirm without trusting the arbiter: the public receipt must
      // record the body this client received, and carry the same verdict.
      const body = bodies.get(res);
      if (v.receipt?.url && body !== undefined) {
        const r = await confirmReceipt(v.receipt.url, body);
        console.log(`    receipt ${v.receipt.url}`);
        console.log(`    log says ${r.verdict}; body matches the receipt: ${r.bodyMatches}`);
      }
    } else {
      console.log(`  tx=${tx} → no verdict yet`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
