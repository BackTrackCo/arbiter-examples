import express from "express";
import cors from "cors";
import { type Address, type Hex } from "viem";
import { createX402r } from "@x402r/sdk";
import { type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions } from "./garbage-detector-plugin.js";
import { CHAIN_ID, INFERENCE_SEED, createProvider } from "./config.js";
import { createClients, x402rConfig, loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Arbiter: Evaluate response bodies via AI, release on PASS
//
// Supports multiple inference providers (openai, ollama, eigenai).
// Set INFERENCE_PROVIDER env var to choose. Default: openai.
//
// Endpoints:
//   POST /verify            — evaluate content + release on PASS
//   POST /attest/identity   — attestation extension (arbiter identity for 402 response)
//   GET  /verdict/:tx       — poll verdict
//   GET  /health            — status
// ---------------------------------------------------------------------------

const clients = createClients();
const provider = createProvider(clients.account);
const PORT = Number(process.env.ARBITER_PORT ?? 3001);

const gdConfig = { provider, seed: INFERENCE_SEED };

let operatorAddress: Address | undefined;
let escrowPeriodAddress: Address | undefined;
try {
  const ctx = loadContext();
  operatorAddress = ctx.operatorAddress;
  escrowPeriodAddress = ctx.escrowPeriodAddress;
} catch {
  operatorAddress = process.env.OPERATOR_ADDRESS as Address | undefined;
}

interface StoredVerdict {
  verdict: GarbageVerdict;
  transaction: string;
  network: string;
  arbiter: Address;
  releaseHash?: Hex;
  timestamp: number;
}

const verdictStore = new Map<string, StoredVerdict>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// POST /verify — evaluate content, release on PASS (called by @x402r/helpers forwardToArbiter)
app.post("/verify", async (req, res) => {
  const { responseBody, transaction, paymentPayload } = req.body;
  if (!responseBody) { res.status(400).json({ error: "responseBody is required" }); return; }

  const scheme = paymentPayload?.accepted?.scheme ?? "escrow";
  const network = paymentPayload?.accepted?.network ?? `eip155:${CHAIN_ID}`;
  console.log(`[verify] tx=${transaction ?? "unknown"} scheme=${scheme}`);
  try {
    const opAddr = operatorAddress;
    if (!opAddr) throw new Error("No operator address — run setup or set OPERATOR_ADDRESS");

    if (!escrowPeriodAddress) throw new Error("No escrowPeriodAddress — run setup or check context.json");

    const sdk = createX402r(x402rConfig({ operatorAddress: opAddr, escrowPeriodAddress }, clients))
      .extend(garbageDetectorActions(gdConfig));

    const gv = await sdk.garbageDetector.evaluate(responseBody);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    const stored: StoredVerdict = {
      verdict: gv, transaction, network, arbiter: clients.account.address, timestamp: Date.now(),
    };

    const rawPaymentInfo = paymentPayload?.payload?.paymentInfo;
    if (scheme === "escrow" && gv.verdict === "PASS" && rawPaymentInfo) {
      try {
        const pi = {
          ...rawPaymentInfo,
          maxAmount: BigInt(rawPaymentInfo.maxAmount),
          salt: BigInt(rawPaymentInfo.salt),
        };
        stored.releaseHash = await sdk.garbageDetector.release(pi);
        console.log(`[verify] Released: ${stored.releaseHash}`);
      } catch (err) {
        console.error("[verify] Release failed:", err);
      }
    }

    verdictStore.set(transaction, stored);
    res.json({
      verdict: gv.verdict,
      reason: gv.reason,
      commitmentHash: gv.commitment.commitmentHash,
      releaseHash: stored.releaseHash ?? null,
    });
  } catch (err) {
    console.error("[verify] Error:", err);
    res.status(500).json({ error: "Garbage detection failed" });
  }
});

app.get("/verdict/:transaction", (req, res) => {
  const stored = verdictStore.get(req.params.transaction);
  if (!stored) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    verdict: stored.verdict.verdict,
    reason: stored.verdict.reason,
    commitment: stored.verdict.commitment,
    arbiter: stored.arbiter,
    releaseHash: stored.releaseHash ?? null,
    timestamp: stored.timestamp,
  });
});

// POST /attest/identity — attestation extension support
// Lets the merchant's resource server include arbiter identity in the 402
// response so clients can verify an independent arbiter exists before paying.
// Used by `createAttestationExtension()` from `@x402r/evm`.
app.post("/attest/identity", (_req, res) => {
  res.json({
    type: "garbage-detection",
    arbiter: clients.account.address,
    provider: provider.name,
    operator: operatorAddress ?? null,
    chainId: CHAIN_ID,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    arbiter: clients.account.address,
    chainId: CHAIN_ID,
    operator: operatorAddress ?? null,
    provider: provider.name,
    seed: INFERENCE_SEED,
    verdictCount: verdictStore.size,
  });
});

app.listen(PORT, () => {
  console.log(`[arbiter] Garbage detector on :${PORT}`);
  console.log(`[arbiter] Address: ${clients.account.address}`);
  console.log(`[arbiter] Provider: ${provider.name}, Seed: ${INFERENCE_SEED}`);
  if (operatorAddress) console.log(`[arbiter] Operator: ${operatorAddress}`);
});
