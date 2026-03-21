import express from "express";
import cors from "cors";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EigenAIClient } from "./eigenai-client.js";
import { detectGarbage, type GarbageVerdict } from "./garbage-detector.js";
import { PRIVATE_KEY, CHAIN_ID, EIGENAI_GRANT_SERVER, EIGENAI_MODEL, EIGENAI_SEED } from "./config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const PORT = Number(process.env.ARBITER_PORT ?? 3001);
const eigenai = new EigenAIClient(account, EIGENAI_GRANT_SERVER, EIGENAI_MODEL);

interface StoredVerdict {
  verdict: GarbageVerdict;
  transaction: string;
  network: string;
  arbiter: Address;
  timestamp: number;
}

const verdictStore = new Map<string, StoredVerdict>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/verify", async (req, res) => {
  const { responseBody, transaction = "unknown", network = `eip155:${CHAIN_ID}`, scheme = "escrow" } = req.body;
  if (!responseBody) { res.status(400).json({ error: "responseBody is required" }); return; }

  console.log(`[verify] tx=${transaction} scheme=${scheme}`);
  try {
    const gv = await detectGarbage(eigenai, responseBody, EIGENAI_SEED);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    verdictStore.set(transaction, {
      verdict: gv, transaction, network, arbiter: account.address, timestamp: Date.now(),
    });

    res.json({
      verdict: gv.verdict,
      reason: gv.reason,
      commitmentHash: gv.commitment.commitmentHash,
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
    timestamp: stored.timestamp,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok", arbiter: account.address, chainId: CHAIN_ID,
    model: EIGENAI_MODEL, seed: EIGENAI_SEED, verdictCount: verdictStore.size,
  });
});

app.listen(PORT, () => {
  console.log(`[arbiter] Garbage detector on :${PORT}`);
  console.log(`[arbiter] Address: ${account.address}`);
  console.log(`[arbiter] Model: ${EIGENAI_MODEL}, Seed: ${EIGENAI_SEED}`);
});

export { app, verdictStore };
