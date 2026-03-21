import express from "express";
import cors from "cors";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createX402r, type PaymentInfo } from "@x402r/sdk";
import { EigenAIClient } from "./eigenai-client.js";
import { detectGarbage, type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions } from "./garbage-detector-plugin.js";
import {
  PRIVATE_KEY, CHAIN_ID, CHAIN, EIGENAI_GRANT_SERVER, EIGENAI_MODEL, EIGENAI_SEED,
} from "./config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const PORT = Number(process.env.ARBITER_PORT ?? 3001);
const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS as Address | undefined;

const eigenai = new EigenAIClient(account, EIGENAI_GRANT_SERVER, EIGENAI_MODEL);

// SDK client for on-chain release
const walletClient = createWalletClient({ account, chain: CHAIN, transport: http() });
const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

function getGarbageDetectorClient(operatorAddress: Address) {
  return createX402r({
    publicClient,
    walletClient,
    operatorAddress,
    chainId: CHAIN_ID,
  }).extend(garbageDetectorActions);
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
    operatorAddress,
  } = req.body;
  if (!responseBody) { res.status(400).json({ error: "responseBody is required" }); return; }

  console.log(`[verify] tx=${transaction} scheme=${scheme}`);
  try {
    const gv = await detectGarbage(eigenai, responseBody, EIGENAI_SEED);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    const stored: StoredVerdict = {
      verdict: gv, transaction, network, arbiter: account.address, timestamp: Date.now(),
    };

    // If escrow + PASS + paymentInfo provided, release via SDK
    const opAddr = operatorAddress ?? OPERATOR_ADDRESS;
    if (scheme === "escrow" && gv.verdict === "PASS" && paymentInfo && opAddr) {
      try {
        const sdk = getGarbageDetectorClient(opAddr);
        const pi: PaymentInfo = {
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
        const releaseHash = await sdk.garbageDetector.release(pi);
        stored.releaseHash = releaseHash;
        console.log(`[verify] Released: ${releaseHash}`);
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
    status: "ok", arbiter: account.address, chainId: CHAIN_ID,
    operator: OPERATOR_ADDRESS ?? null,
    model: EIGENAI_MODEL, seed: EIGENAI_SEED, verdictCount: verdictStore.size,
  });
});

app.listen(PORT, () => {
  console.log(`[arbiter] Garbage detector on :${PORT}`);
  console.log(`[arbiter] Address: ${account.address}`);
  console.log(`[arbiter] Model: ${EIGENAI_MODEL}, Seed: ${EIGENAI_SEED}`);
  if (OPERATOR_ADDRESS) console.log(`[arbiter] Operator: ${OPERATOR_ADDRESS}`);
});

export { app, verdictStore };
