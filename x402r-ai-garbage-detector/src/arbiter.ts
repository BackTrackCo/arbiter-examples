import express from "express";
import cors from "cors";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, erc20Abi, formatUnits, keccak256, toBytes } from "viem";
import { createX402r } from "@x402r/sdk";
import { type GarbageVerdict } from "./garbage-detector.js";
import { garbageDetectorActions, type GarbageDetectorActions } from "./garbage-detector-plugin.js";
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
const PORT = Number(process.env.PORT ?? process.env.ARBITER_PORT ?? 3001);

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
  responseBody: string;
  responseBodyHash: Hex;
  payer: Address;
  transaction: string;
  network: string;
  arbiter: Address;
  releaseHash?: Hex;
  refundHash?: Hex;
  refundError?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Verdict persistence -- survives arbiter restarts so clients can always
// retrieve the payload the arbiter evaluated (needed for anti-cheating).
// Each verdict is stored as a JSON file in VERDICTS_DIR keyed by tx hash.
// ---------------------------------------------------------------------------

const VERDICTS_DIR = process.env.VERDICTS_DIR ?? "verdicts";
const MAX_CACHE = 1_000;
const verdictCache = new Map<string, StoredVerdict>();

function ensureVerdictDir() {
  if (!existsSync(VERDICTS_DIR)) mkdirSync(VERDICTS_DIR, { recursive: true });
}

function txToFilename(tx: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) throw new Error(`Invalid tx hash: ${tx}`);
  return `${tx}.json`;
}

function saveVerdict(tx: string, verdict: StoredVerdict) {
  ensureVerdictDir();
  writeFileSync(join(VERDICTS_DIR, txToFilename(tx)), JSON.stringify(verdict));
  if (verdictCache.size >= MAX_CACHE) {
    const oldest = verdictCache.keys().next().value;
    if (oldest) verdictCache.delete(oldest);
  }
  verdictCache.set(tx, verdict);
}

function loadVerdict(tx: string): StoredVerdict | undefined {
  if (verdictCache.has(tx)) return verdictCache.get(tx);
  let filename: string;
  try { filename = txToFilename(tx); } catch { return undefined; }
  const path = join(VERDICTS_DIR, filename);
  if (!existsSync(path)) return undefined;
  try {
    const v = JSON.parse(readFileSync(path, "utf-8")) as StoredVerdict;
    verdictCache.set(tx, v);
    return v;
  } catch (err) {
    console.warn(`[verdict] Failed to load ${path}:`, err);
    return undefined;
  }
}

function getVerdictCount(): number {
  ensureVerdictDir();
  try { return readdirSync(VERDICTS_DIR).filter((f) => f.endsWith(".json")).length; }
  catch { return verdictCache.size; }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * Refund the payer immediately on FAIL verdict.
 *
 * The delivery protection v2 operator includes SAC(arbiter) in the
 * refundInEscrowCondition OrCondition, so the arbiter can refund without
 * waiting for the escrow period to expire. Independent keepers can also
 * discover payments via the PaymentIndexRecorder and trigger refunds
 * after the escrow window.
 */
async function refundPayer(sdk: any, paymentInfo: any, transaction: string): Promise<{ hash?: Hex; error?: string }> {
  console.log(`[verify] FAIL — refunding immediately for tx=${transaction ?? "unknown"}`);
  try {
    const hash = await sdk.payment.refundInEscrow(paymentInfo, paymentInfo.maxAmount);
    console.log(`[refund] tx=${transaction} refunded: ${hash}`);
    return { hash };
  } catch (err: any) {
    const msg = err.shortMessage ?? err.message ?? String(err);
    console.error(`[refund] tx=${transaction} failed:`, msg);
    return { error: msg };
  }
}

/** Parse chain ID from eip155 network string (e.g. "eip155:84532" -> 84532). */
function parseChainId(network: string): number {
  const match = network.match(/^eip155:(\d+)$/);
  if (!match) {
    console.warn(`[verify] Malformed network "${network}", falling back to chain ${CHAIN_IDS[0]}`);
    return CHAIN_IDS[0];
  }
  const chainId = Number(match[1]);
  if (!CHAIN_IDS.includes(chainId)) {
    console.warn(`[verify] Chain ${chainId} not in CHAIN_IDS [${CHAIN_IDS}], falling back to ${CHAIN_IDS[0]}`);
    return CHAIN_IDS[0];
  }
  return chainId;
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
      .extend(garbageDetectorActions(gdConfig) as any) as unknown as ReturnType<typeof createX402r> & GarbageDetectorActions;

    const gv = await sdk.garbageDetector.evaluate(responseBody);
    console.log(`[verify] ${gv.verdict} — ${gv.reason}`);

    const bodyStr = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    const rawPaymentInfo = paymentPayload?.payload?.paymentInfo;
    const payer = (paymentPayload?.payload?.authorization?.from ?? rawPaymentInfo?.payer ?? "0x0") as Address;
    const stored: StoredVerdict = {
      verdict: gv, responseBody: bodyStr, responseBodyHash: keccak256(toBytes(bodyStr)),
      payer, transaction, network, arbiter: clients.account.address, timestamp: Date.now(),
    };

    if (scheme === "commerce" && rawPaymentInfo) {
      const pi = {
        ...rawPaymentInfo,
        payer,
        maxAmount: BigInt(rawPaymentInfo.maxAmount),
        salt: BigInt(rawPaymentInfo.salt),
      };

      if (gv.verdict === "PASS") {
        try {
          stored.releaseHash = await sdk.garbageDetector.release(pi);
          console.log(`[verify] Released: ${stored.releaseHash}`);
        } catch (err: any) {
          console.error("[verify] Release failed:", err.shortMessage ?? err.message ?? err);
        }
      } else {
        // FAIL: arbiter can refund immediately (SAC(arbiter) in refundInEscrow OrCondition)
        const result = await refundPayer(sdk, pi, transaction);
        stored.refundHash = result.hash;
        stored.refundError = result.error;
      }
    }

    saveVerdict(transaction, stored);
    res.json({
      verdict: gv.verdict,
      reason: gv.reason,
      commitmentHash: gv.commitment.commitmentHash,
      releaseHash: stored.releaseHash ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[verify] Error:", msg);
    res.status(500).json({ error: "Garbage detection failed", detail: msg });
  }
});

app.get("/verdict/:transaction", (req, res) => {
  const stored = loadVerdict(req.params.transaction);
  if (!stored) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    verdict: stored.verdict.verdict,
    reason: stored.verdict.reason,
    commitment: stored.verdict.commitment,
    responseBodyHash: stored.responseBodyHash,
    arbiter: stored.arbiter,
    releaseHash: stored.releaseHash ?? null,
    refundHash: stored.refundHash ?? null,
    refundError: stored.refundError ?? null,
    timestamp: stored.timestamp,
  });
});

// GET /verdict/:tx/payload — returns the response body the arbiter evaluated
// Protected by payer auth: only the wallet that paid can retrieve the payload.
// This prevents the arbiter from becoming a free CDN for paid content while
// ensuring the client can always get what they paid for, even if the merchant
// sent them garbage.
//
// Auth: Authorization header = EIP-191 personal_sign of "x402r:payload:{txHash}"
// The recovered signer must match the payer address from the payment.
app.get("/verdict/:transaction/payload", async (req, res) => {
  const stored = loadVerdict(req.params.transaction);
  if (!stored) { res.status(404).json({ error: "Not found" }); return; }

  const signature = req.headers.authorization as Hex | undefined;
  if (!signature) {
    res.status(401).json({
      error: "Authorization required",
      message: 'Sign "x402r:payload:{txHash}" with your wallet and pass as Authorization header',
    });
    return;
  }

  try {
    const message = `x402r:payload:${req.params.transaction}`;
    const cc = getChainClients(clients, CHAIN_IDS[0]);
    const valid = await cc.publicClient.verifyMessage({
      address: stored.payer,
      message,
      signature,
    });
    if (!valid) {
      res.status(403).json({ error: "Signature does not match payer" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  res.json({
    responseBody: stored.responseBody,
    responseBodyHash: stored.responseBodyHash,
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
    description: "AI delivery protection arbiter. Evaluates paid API responses for obvious garbage (empty bodies, error pages, placeholder text, gibberish). PASS releases payment to merchant. FAIL triggers automatic refund to payer.",
    skills: {
      evaluate: "POST /verify — submit a response body for garbage detection. Returns PASS/FAIL verdict with commitment hash.",
      verdicts: "GET /verdict/:tx — retrieve the verdict for a given payment transaction hash.",
      payload: "GET /verdict/:tx/payload — retrieve the evaluated response body (payer auth required).",
    },
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
    verdictCount: getVerdictCount(),
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
  } catch (err) {
    console.warn("[arbiter] Balance check failed (RPC misconfigured?):", err instanceof Error ? err.message : err);
  }
});
