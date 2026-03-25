import { toClientEvmSigner } from "@x402/evm";
import { EscrowEvmScheme } from "@x402r/evm/escrow/client";
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
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";

async function main() {
  const { account } = createClients();
  const networkId = `eip155:${CHAIN_ID}` as const;

  console.log(`Client: ${account.address}`);

  const clientSigner = toClientEvmSigner(account);
  const client = new x402Client();
  client.register(networkId, new EscrowEvmScheme(clientSigner));
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
    } else {
      console.log(`  tx=${tx} → no verdict yet`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
