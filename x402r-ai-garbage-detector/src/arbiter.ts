import express from "express";
import cors from "cors";
import { type Address, type Hex, erc20Abi, formatUnits } from "viem";
import { createX402r } from "@x402r/sdk";
import { type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions } from "./garbage-detector-plugin.js";
import { CHAIN_IDS, INFERENCE_SEED, createProvider, getUsdcAddress } from "./config.js";
import { createClients, getChainClients, x402rConfig, loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Arbiter: Evaluate response bodies via AI, release on PASS
//
// Supports multiple chains (CHAIN_IDS env var) and inference providers
// (clawrouter, openai, ollama, eigenai). Default: clawrouter.
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
  escrowPeriodAddress = process.env.ESCROW_PERIOD_ADDRESS as Address | undefined;
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

/**
 * Schedule a refundInEscrow call after the escrow period expires.
 * The arbiter acts as a keeper — on FAIL, it waits for the escrow window
 * then refunds the payer automatically.
 */
function scheduleRefund(sdk: any, paymentInfo: any, transaction: string) {
  sdk.escrow.getDuration().then((duration: bigint) => {
    const delayMs = (Number(duration) + 10) * 1000; // +10s buffer
    console.log(`[verify] FAIL — scheduling refund in ${Number(duration)}s for tx=${transaction ?? "unknown"}`);
    setTimeout(async () => {
      try {
        const hash = await sdk.payment.refundInEscrow(paymentInfo, paymentInfo.maxAmount);
        console.log(`[refund] tx=${transaction} refunded: ${hash}`);
      } catch (err) {
        console.error(`[refund] tx=${transaction} failed:`, err);
      }
    }, delayMs);
  }).catch((err: any) => {
    console.error("[verify] Could not read escrow period:", err);
  });
}

/** Parse chain ID from eip155 network string (e.g. "eip155:84532" → 84532). */
function parseChainId(network: string): number {
  const match = network.match(/^eip155:(\d+)$/);
  return match ? Number(match[1]) : CHAIN_IDS[0];
}

// POST /verify — evaluate content, release on PASS (called by @x402r/helpers forwardToArbiter)
app.post("/verify", async (req, res) => {
  const { responseBody, transaction, paymentPayload } = req.body;
  if (!responseBody) { res.status(400).json({ error: "responseBody is required" }); return; }

  const scheme = paymentPayload?.accepted?.scheme ?? "commerce";
  const network = paymentPayload?.accepted?.network ?? `eip155:${CHAIN_IDS[0]}`;
  const chainId = parseChainId(network);
  console.log(`[verify] tx=${transaction ?? "unknown"} scheme=${scheme} chain=${chainId}`);
  try {
    const opAddr = operatorAddress;
    if (!opAddr) throw new Error("No operator address — run setup or set OPERATOR_ADDRESS");
    if (!escrowPeriodAddress) throw new Error("No escrowPeriodAddress — run setup or set ESCROW_PERIOD_ADDRESS");

    const sdk = createX402r(x402rConfig({ operatorAddress: opAddr, escrowPeriodAddress }, clients, chainId))
      .extend(garbageDetectorActions(gdConfig));

    const gv = await sdk.garbageDetector.evaluate(responseBody);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    const stored: StoredVerdict = {
      verdict: gv, transaction, network, arbiter: clients.account.address, timestamp: Date.now(),
    };

    const rawPaymentInfo = paymentPayload?.payload?.paymentInfo;
    if (scheme === "commerce" && rawPaymentInfo) {
      const pi = {
        ...rawPaymentInfo,
        maxAmount: BigInt(rawPaymentInfo.maxAmount),
        salt: BigInt(rawPaymentInfo.salt),
      };

      if (gv.verdict === "PASS") {
        try {
          stored.releaseHash = await sdk.garbageDetector.release(pi);
          console.log(`[verify] Released: ${stored.releaseHash}`);
        } catch (err) {
          console.error("[verify] Release failed:", err);
        }
      } else {
        // FAIL: schedule refund after escrow period expires
        scheduleRefund(sdk, pi, transaction);
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
    chains: CHAIN_IDS,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    arbiter: clients.account.address,
    chains: CHAIN_IDS,
    operator: operatorAddress ?? null,
    provider: provider.name,
    seed: INFERENCE_SEED,
    verdictCount: verdictStore.size,
  });
});

app.listen(PORT, async () => {
  console.log(`[arbiter] Garbage detector on :${PORT}`);
  console.log(`[arbiter] Address: ${clients.account.address}`);
  console.log(`[arbiter] Chains: ${CHAIN_IDS.join(", ")}`);
  console.log(`[arbiter] Provider: ${provider.name}, Seed: ${INFERENCE_SEED}`);
  if (operatorAddress) console.log(`[arbiter] Operator: ${operatorAddress}`);

  // Check balances on default chain — arbiter needs ETH (gas) and USDC (clawrouter)
  try {
    const usdc = getUsdcAddress(CHAIN_IDS[0]);
    const cc = getChainClients(clients, CHAIN_IDS[0]);
    const [ethBalance, usdcBalance] = await Promise.all([
      cc.publicClient.getBalance({ address: clients.account.address }),
      cc.publicClient.readContract({
        address: usdc, abi: erc20Abi, functionName: "balanceOf",
        args: [clients.account.address],
      }),
    ]);
    console.log(`[arbiter] ETH: ${formatUnits(ethBalance, 18)}, USDC: ${formatUnits(usdcBalance, 6)}`);
    if (ethBalance === 0n) {
      console.warn(`[arbiter] ⚠ No ETH — fund ${clients.account.address} for gas (release txs)`);
    }
    if (usdcBalance === 0n && provider.name.startsWith("clawrouter")) {
      console.warn(`[arbiter] ⚠ No USDC — fund ${clients.account.address} to pay for inference`);
    }
  } catch {
    // Non-critical — just skip the check
  }
});
