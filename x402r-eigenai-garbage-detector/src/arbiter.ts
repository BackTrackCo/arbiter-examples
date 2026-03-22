import express from "express";
import cors from "cors";
import { type Address, type Hex } from "viem";
import { createX402r } from "@x402r/sdk";
import { EigenAIClient } from "./eigenai-client.js";
import { type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions } from "./garbage-detector-plugin.js";
import { CHAIN_ID, EIGENAI } from "./config.js";
import { createClients, x402rConfig, loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Arbiter: Evaluate response bodies via EigenAI, release on PASS
//
// Usage: pnpm run arbiter
// ---------------------------------------------------------------------------

const clients = createClients();
const eigenai = new EigenAIClient(clients.account, EIGENAI.grantServer, EIGENAI.model);
const PORT = Number(process.env.ARBITER_PORT ?? 3001);

const gdConfig = { eigenai, seed: EIGENAI.seed };

// Try to load operator from context.json, fall back to env
let operatorAddress: Address | undefined;
try {
  const ctx = loadContext();
  operatorAddress = ctx.operatorAddress;
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

app.post("/verify", async (req, res) => {
  const {
    responseBody,
    transaction = "unknown",
    network = `eip155:${CHAIN_ID}`,
    scheme = "escrow",
    paymentInfo,
  } = req.body;
  if (!responseBody) { res.status(400).json({ error: "responseBody is required" }); return; }

  console.log(`[verify] tx=${transaction} scheme=${scheme}`);
  try {
    const opAddr = operatorAddress;
    if (!opAddr) throw new Error("No operator address — run setup or set OPERATOR_ADDRESS");

    const sdk = createX402r(x402rConfig({ operatorAddress: opAddr, escrowPeriodAddress: undefined as any }, clients))
      .extend(garbageDetectorActions(gdConfig));

    const gv = await sdk.garbageDetector.evaluate(responseBody);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    const stored: StoredVerdict = {
      verdict: gv, transaction, network, arbiter: clients.account.address, timestamp: Date.now(),
    };

    // Release on PASS for escrow scheme
    if (scheme === "escrow" && gv.verdict === "PASS" && paymentInfo) {
      try {
        const pi = {
          operator: paymentInfo.operator,
          payer: paymentInfo.payer,
          receiver: paymentInfo.receiver,
          token: paymentInfo.token,
          maxAmount: BigInt(paymentInfo.maxAmount),
          preApprovalExpiry: paymentInfo.preApprovalExpiry,
          authorizationExpiry: paymentInfo.authorizationExpiry,
          refundExpiry: paymentInfo.refundExpiry,
          minFeeBps: paymentInfo.minFeeBps,
          maxFeeBps: paymentInfo.maxFeeBps,
          feeReceiver: paymentInfo.feeReceiver,
          salt: BigInt(paymentInfo.salt),
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    arbiter: clients.account.address,
    chainId: CHAIN_ID,
    operator: operatorAddress ?? null,
    model: EIGENAI.model,
    seed: EIGENAI.seed,
    verdictCount: verdictStore.size,
  });
});

app.listen(PORT, () => {
  console.log(`[arbiter] Garbage detector on :${PORT}`);
  console.log(`[arbiter] Address: ${clients.account.address}`);
  console.log(`[arbiter] Model: ${EIGENAI.model}, Seed: ${EIGENAI.seed}`);
  if (operatorAddress) console.log(`[arbiter] Operator: ${operatorAddress}`);
});
