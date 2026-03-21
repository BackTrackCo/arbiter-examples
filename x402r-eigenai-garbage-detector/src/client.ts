import { privateKeyToAccount } from "viem/accounts";
import { toClientEvmSigner } from "@x402/evm";
import { EscrowEvmScheme } from "@x402r/evm/escrow/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { PRIVATE_KEY, NETWORK_ID } from "./config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:4021";
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function pollVerdict(tx: string, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${ARBITER_URL}/verdict/${tx}`);
    if (res.ok) return res.json();
    console.log(`  Polling verdict... (${i + 1}/${maxAttempts})`);
    await sleep(3000);
  }
  throw new Error("Verdict not found");
}

async function main() {
  console.log(`Client: ${account.address}`);

  const clientSigner = toClientEvmSigner(account);
  const client = new x402Client();
  client.register(NETWORK_ID, new EscrowEvmScheme(clientSigner));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Test 1: Valid response
  console.log("\n--- Valid weather response ---");
  const res1 = await fetchWithPayment(`${MERCHANT_URL}/weather`);
  console.log(`  Status: ${res1.status}`);
  console.log(`  Body:`, await res1.json());

  // Test 2: Garbage response
  console.log("\n--- Garbage response ---");
  const res2 = await fetchWithPayment(`${MERCHANT_URL}/garbage`);
  console.log(`  Status: ${res2.status}`);
  console.log(`  Body:`, await res2.json());

  // Check verdicts
  console.log("\n--- Arbiter health ---");
  const health = await (await fetch(`${ARBITER_URL}/health`)).json();
  console.log(health);
}

main().catch(console.error);
