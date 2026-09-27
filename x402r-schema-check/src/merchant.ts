import express from "express";
import cors from "cors";
import type { Address } from "viem";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { AuthCaptureEvmScheme } from "@x402r/evm/auth-capture/server";
import {
  createAttestationExtension,
  declareAttestationExtension,
} from "@x402r/evm/extensions/attestation";
import { forwardToArbiter, x402rDefaults } from "@x402r/helpers";
import { CHAIN_ID } from "./config.js";
import { loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Merchant server — no private key needed, just an address to receive payments
//
// Usage: MERCHANT_ADDRESS=0x... OPERATOR_ADDRESS=0x... FACILITATOR_URL=... pnpm run merchant
// ---------------------------------------------------------------------------

const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS as Address;
if (!MERCHANT_ADDRESS) throw new Error("MERCHANT_ADDRESS env required");

const PORT = Number(process.env.PORT ?? process.env.MERCHANT_PORT ?? 4021);
const FACILITATOR_URL = process.env.FACILITATOR_URL;
if (!FACILITATOR_URL) throw new Error("FACILITATOR_URL env required");
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";
const networkId = `eip155:${CHAIN_ID}` as const;

// Prefer env var, fall back to context.json
let operatorAddress = process.env.OPERATOR_ADDRESS as Address | undefined;
if (!operatorAddress) {
  const ctx = loadContext();
  operatorAddress = ctx.operatorAddress;
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(networkId, new AuthCaptureEvmScheme())
  .registerExtension(createAttestationExtension(ARBITER_URL))
  .onAfterSettle(forwardToArbiter(ARBITER_URL));

const DOCS_URL = "https://docs.x402r.org";

// Actionable body so `curl` users (and agents that parse body before headers)
// don't just see `{}` and think the endpoint is broken.
const unpaidResponseBody = () => ({
  contentType: "application/json",
  body: {
    error: "Payment required",
    help: `See payment-required header (base64 JSON) or ${DOCS_URL}`,
  },
});

const app = express();
app.set("trust proxy", true);
app.use(cors());

// RFC 5988 Link header on every 402 response (paid routes and any future
// non-payment 402) so agents have a machine-readable pointer to docs.
// Must wrap res.status(); res.on('finish') fires after headers are sent.
app.use((_req, res, next) => {
  const originalStatus = res.status.bind(res);
  res.status = (code: number) => {
    if (code === 402) res.setHeader("Link", `<${DOCS_URL}>; rel="help"`);
    return originalStatus(code);
  };
  next();
});

const paidRoute = {
  accepts: [{
    scheme: "auth-capture" as const,
    network: networkId,
    price: "$0.01",
    payTo: MERCHANT_ADDRESS,
    // x402rDefaults returns an interface without an index signature, and the
    // published @x402/core 2.14.0 types `extra` as Record<string, unknown>.
    // Type-only: the object sent is unchanged.
    extra: x402rDefaults({
      captureAuthorizer: operatorAddress,
      maxFeeBps: 500,
    }) as unknown as Record<string, unknown>,
  }],
  extensions: declareAttestationExtension(),
  unpaidResponseBody,
};

app.use(paymentMiddleware({
  "GET /forecast": paidRoute,
  "GET /forecast-broken": paidRoute,
}, resourceServer));

// Meets spec.json: three days, every key present, unit C or F.
app.get("/forecast", (_req, res) => {
  res.json([
    { day: "mon", high: 21, low: 12, unit: "C" },
    { day: "tue", high: 23, low: 13, unit: "C" },
    { day: "wed", high: 19, low: 11, unit: "C" },
  ]);
});

// Looks like data and is not what was paid for: two days, a missing key,
// a unit outside the rules. An AI judge may well let this through; the
// rules do not.
app.get("/forecast-broken", (_req, res) => {
  res.json([
    { day: "mon", high: 21, low: 12, unit: "K" },
    { day: "tue", high: 23 },
  ]);
});

app.listen(PORT, () => {
  console.log(`[merchant] Running on :${PORT}`);
  console.log(`[merchant] Pay to: ${MERCHANT_ADDRESS}, Operator: ${operatorAddress}`);
  console.log(`[merchant] Arbiter: ${ARBITER_URL}`);
});
