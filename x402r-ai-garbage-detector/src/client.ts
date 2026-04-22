import { toClientEvmSigner } from "@x402/evm";
import { CommerceEvmScheme } from "@x402r/evm/commerce/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { CHAIN_ID } from "./config.js";
import { createClients } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Client: Make paid requests through the x402 flow
//
// Usage: pnpm run client
// ---------------------------------------------------------------------------

const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:4021";

// Pull the arbiter URL from the merchant's 402 response when possible so the
// client works against any deployment without hardcoding. Env var still wins.
async function discoverArbiterUrl(merchantUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${merchantUrl}/weather`);
    const header = res.headers.get("payment-required");
    if (!header) return null;
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    const url = decoded?.extensions?.attestation?.info?.identity?.url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

// `x-payment-transaction` comes back null on current x402 versions; the real
// settlement hash ships base64-encoded in `payment-response`. Check both.
function extractSettleTx(res: Response): string | null {
  const direct = res.headers.get("x-payment-transaction");
  if (direct) return direct;
  const pr = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!pr) return null;
  try {
    const parsed = JSON.parse(Buffer.from(pr, "base64").toString("utf-8"));
    return typeof parsed?.transaction === "string" ? parsed.transaction : null;
  } catch {
    return null;
  }
}

async function main() {
  const { account } = createClients();
  const networkId = `eip155:${CHAIN_ID}` as const;

  console.log(`Client: ${account.address}`);

  const arbiterUrl =
    process.env.ARBITER_URL ?? (await discoverArbiterUrl(MERCHANT_URL));

  const clientSigner = toClientEvmSigner(account);
  const client = new x402Client();
  client.register(networkId, new CommerceEvmScheme(clientSigner));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // --- 1. Valid response ---
  console.log("\n1. Requesting /weather (valid content)...");
  const res1 = await fetchWithPayment(`${MERCHANT_URL}/weather`);
  console.log(`  Status: ${res1.status}`);
  if (res1.ok) console.log(`  Body:`, await res1.json());

  // --- 2. Garbage response ---
  console.log("\n2. Requesting /garbage (garbage content)...");
  const res2 = await fetchWithPayment(`${MERCHANT_URL}/garbage`);
  console.log(`  Status: ${res2.status}`);
  if (res2.ok) console.log(`  Body:`, await res2.json());

  // --- 3. Poll verdicts ---
  // Payment already settled above, so arbiter failures must degrade gracefully
  // rather than crash: a verdict is supplementary info, not required.
  console.log("\n3. Polling arbiter verdicts...");
  if (!arbiterUrl) {
    console.log("  No arbiter URL (set ARBITER_URL or have the merchant advertise one in the 402 response), skipping.");
    return;
  }

  try {
    const health = await (await fetch(`${arbiterUrl}/health`)).json() as any;
    console.log(`  Total verdicts: ${health.verdictCount}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Arbiter ${arbiterUrl} unreachable (${msg}), skipping verdict polling.`);
    return;
  }

  // Give arbiter a moment to process the forwarded responses
  await new Promise((r) => setTimeout(r, 2000));

  for (const res of [res1, res2]) {
    const tx = extractSettleTx(res);
    if (!tx) {
      console.log(`  tx=unknown (no settlement hash in response headers)`);
      continue;
    }
    try {
      const vRes = await fetch(`${arbiterUrl}/verdict/${tx}`);
      if (vRes.ok) {
        const v = await vRes.json() as any;
        console.log(`  tx=${tx} → ${v.verdict} (${v.reason})`);
      } else {
        console.log(`  tx=${tx} → no verdict yet`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  tx=${tx} → verdict fetch failed (${msg})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
