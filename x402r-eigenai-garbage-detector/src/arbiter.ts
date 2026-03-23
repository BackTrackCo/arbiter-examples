import express from "express";
import cors from "cors";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import { createX402r } from "@x402r/sdk";
import { EigenAIClient } from "./eigenai-client.js";
import { type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions } from "./garbage-detector-plugin.js";
import { signArbiterIdentity, signAcknowledgment } from "./arbiter-identity.js";
import { CHAIN_ID, EIGENAI } from "./config.js";
import { createClients, x402rConfig, loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Arbiter: Evaluate response bodies via EigenAI, release on PASS
//
// Endpoints:
//   GET  /identity?operator=0x...  — signed arbiter identity (pre-payment)
//   POST /verify                   — evaluate + signed acknowledgment (post-payment)
//   GET  /verdict/:tx              — poll verdict
//   GET  /health                   — status
// ---------------------------------------------------------------------------

const clients = createClients();
const eigenai = new EigenAIClient(clients.account, EIGENAI.grantServer, EIGENAI.model);
const PORT = Number(process.env.ARBITER_PORT ?? 3001);
const ARBITER_INFO = process.env.ARBITER_INFO ?? "ipfs://QmPlaceholder";

const gdConfig = { eigenai, seed: EIGENAI.seed };

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

// GET /identity — pre-payment: signed arbiter identity
app.get("/identity", async (req, res) => {
  const operator = (req.query.operator as Address) ?? operatorAddress;
  if (!operator) { res.status(400).json({ error: "operator query param required" }); return; }

  const identity = await signArbiterIdentity(clients.account, operator, ARBITER_INFO);
  res.json(identity);
});

// POST /acknowledge — sign acknowledgment that arbiter received content
app.post("/acknowledge", async (req, res) => {
  const { operator, transaction, network, contentHash } = req.body;
  if (!operator || !contentHash) { res.status(400).json({ error: "operator and contentHash required" }); return; }

  const ack = await signAcknowledgment(clients.account, {
    operator,
    transaction: transaction ?? "unknown",
    network: network ?? `eip155:${CHAIN_ID}`,
    contentHash,
  });
  res.json(ack);
});

// POST /verify — evaluate content (called by hook, fire-and-forget)
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

    // Sign acknowledgment — proves arbiter received this content
    const contentHash = keccak256(toBytes(responseBody));
    const acknowledgment = await signAcknowledgment(clients.account, {
      operator: opAddr,
      transaction,
      network,
      contentHash,
    });

    verdictStore.set(transaction, stored);
    res.json({
      verdict: gv.verdict,
      reason: gv.reason,
      commitmentHash: gv.commitment.commitmentHash,
      releaseHash: stored.releaseHash ?? null,
      acknowledgment,
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
