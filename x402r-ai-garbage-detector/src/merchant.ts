import express from "express";
import cors from "cors";
import type { Address } from "viem";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { CommerceServerScheme } from "@x402r/evm/commerce/server";
import {
  createAttestationExtension,
  declareAttestationExtension,
} from "@x402r/evm/extensions/attestation";
import { authCaptureEscrow, tokenCollector, forwardToArbiter } from "@x402r/helpers";
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
// Optional: absolute URL agents should call (e.g. https://merchant.example.com).
// Used to populate the OpenAPI `servers` field for x402scan discovery; defaults
// to the request origin when not set.
const PUBLIC_URL = process.env.PUBLIC_URL;
const networkId = `eip155:${CHAIN_ID}` as const;

// Prefer env var, fall back to context.json
let operatorAddress = process.env.OPERATOR_ADDRESS as Address | undefined;
if (!operatorAddress) {
  const ctx = loadContext();
  operatorAddress = ctx.operatorAddress;
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(networkId, new CommerceServerScheme())
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

const paidRoute = {
  accepts: [{
    scheme: "commerce" as const,
    network: networkId,
    price: "$0.01",
    payTo: MERCHANT_ADDRESS,
    extra: {
      escrowAddress: authCaptureEscrow,
      operatorAddress: operatorAddress,
      tokenCollector,
      feeReceiver: operatorAddress,
      maxFeeBps: 500,
    },
  }],
  extensions: declareAttestationExtension(),
  unpaidResponseBody,
};

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

// OpenAPI document for x402scan discovery. Must be mounted before the payment
// middleware so it stays free to fetch. See https://www.x402scan.com/discovery/spec
const PRICE_USD = "0.010000";
const buildOpenApi = (publicUrl: string) => ({
  openapi: "3.1.0",
  info: {
    title: "x402r AI Garbage Detector",
    version: "0.1.0",
    description:
      "Demo merchant for x402r refundable payments. Responses that the configured AI arbiter classifies as garbage trigger an automatic on-chain refund of the buyer's escrow.",
    "x-guidance":
      "Two USD $0.01 demo endpoints behind a refundable x402r escrow. GET /weather returns a clean payload (arbiter PASSes, escrow is captured). GET /garbage returns an error-shaped payload (arbiter FAILs, escrow voids and the buyer is auto-refunded after the window). Pair the two to exercise both happy and refund paths.",
  },
  servers: [{ url: publicUrl }],
  paths: {
    "/weather": {
      get: {
        operationId: "getWeather",
        summary: "Weather demo (arbiter PASS path)",
        tags: ["Demo"],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: PRICE_USD },
          protocols: [{ x402: {} }],
        },
        parameters: [
          {
            name: "location",
            in: "query",
            required: false,
            description: "Optional label echoed in the `location` response field. Defaults to 'San Francisco'.",
            schema: { type: "string", maxLength: 64 },
          },
        ],
        responses: {
          "200": {
            description: "Weather payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    location: { type: "string" },
                    temperature: { type: "number" },
                    conditions: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                  required: ["location", "temperature", "conditions", "timestamp"],
                },
              },
            },
          },
          "402": { description: "Payment Required" },
        },
      },
    },
    "/garbage": {
      get: {
        operationId: "getGarbage",
        summary: "Garbage demo (arbiter FAIL, auto-refund path)",
        tags: ["Demo"],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: PRICE_USD },
          protocols: [{ x402: {} }],
        },
        parameters: [
          {
            name: "seed",
            in: "query",
            required: false,
            description: "Optional integer echoed back in the response. Lets agents distinguish replays in logs.",
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Error-shaped 'garbage' payload returned with HTTP 200 (the body is what the arbiter judges)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    message: { type: "string" },
                    code: { type: "integer" },
                    seed: { type: "integer" },
                  },
                  required: ["error", "message", "code"],
                },
              },
            },
          },
          "402": { description: "Payment Required" },
        },
      },
    },
  },
});

app.get("/openapi.json", (req, res) => {
  const publicUrl = PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
  res.json(buildOpenApi(publicUrl));
});

app.use(paymentMiddleware({
  "GET /weather": paidRoute,
  "GET /garbage": paidRoute,
}, resourceServer));

app.get("/weather", (req, res) => {
  const raw = req.query.location;
  const location = typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? raw : "San Francisco";
  res.json({ location, temperature: 68, conditions: "Partly cloudy", timestamp: new Date().toISOString() });
});

app.get("/garbage", (req, res) => {
  const body: Record<string, unknown> = { error: "Internal Server Error", message: "Something went wrong", code: 500 };
  const seed = Number(req.query.seed);
  if (Number.isFinite(seed)) body.seed = seed;
  res.json(body);
});

app.listen(PORT, () => {
  console.log(`[merchant] Running on :${PORT}`);
  console.log(`[merchant] Pay to: ${MERCHANT_ADDRESS}, Operator: ${operatorAddress}`);
  console.log(`[merchant] Arbiter: ${ARBITER_URL}`);
});
