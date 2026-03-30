import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { CommerceServerScheme } from "@x402r/evm/commerce/server";
import {
  createJWSOfferReceiptIssuer,
  createOfferReceiptExtension,
  declareOfferReceiptExtension,
  type JWSSigner,
} from "@x402/extensions/offer-receipt";
import {
  createAttestationExtension,
  declareAttestationExtension,
} from "@x402r/evm/extensions/attestation";
import { authCaptureEscrow, forwardToArbiter } from "@x402r/helpers";
import { CHAIN_ID } from "./config.js";
import { loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Merchant (no wallet): JWS receipt signing with ES256 key
//
// No private key needed — generates an ephemeral ECDSA key for signing.
// In production, use a KMS-backed key or load from secure storage.
//
// Usage: FACILITATOR_URL=http://localhost:4022 MERCHANT_ADDRESS=0x... pnpm run merchant:jws
// ---------------------------------------------------------------------------

const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS as `0x${string}`;
if (!MERCHANT_ADDRESS) throw new Error("MERCHANT_ADDRESS env required (no wallet in JWS mode)");
const PORT = Number(process.env.MERCHANT_PORT ?? 4021);
const FACILITATOR_URL = process.env.FACILITATOR_URL;
if (!FACILITATOR_URL) throw new Error("FACILITATOR_URL env required");
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";
const networkId = `eip155:${CHAIN_ID}` as const;

const ctx = loadContext();
// JWS with ES256 — no wallet needed
const ecKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwsSigner: JWSSigner = {
  format: "jws",
  algorithm: "ES256",
  sign: async (payload: Uint8Array) => {
    const sign = crypto.createSign("SHA256");
    sign.update(payload);
    return sign.sign({ key: ecKey.privateKey, dsaEncoding: "ieee-p1363" }, "base64url");
  },
};

const issuer = createJWSOfferReceiptIssuer("did:web:localhost#key-1", jwsSigner);

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(networkId, new CommerceServerScheme())
  .registerExtension(createOfferReceiptExtension(issuer))
  .registerExtension(createAttestationExtension(ARBITER_URL))
  .onAfterSettle(forwardToArbiter(ARBITER_URL));

const app = express();
app.use(cors());

app.use(paymentMiddleware({
  "GET /weather": {
    accepts: [{
      scheme: "commerce" as const,
      network: networkId,
      price: "$0.01",
      payTo: MERCHANT_ADDRESS,
      extra: {
        escrowAddress: authCaptureEscrow,
        operatorAddress: ctx.operatorAddress,
        feeReceiver: ctx.operatorAddress,
        maxFeeBps: 500,
      },
    }],
    ...declareOfferReceiptExtension({ includeTxHash: true }),
    ...declareAttestationExtension(),
  },
  "GET /garbage": {
    accepts: [{
      scheme: "commerce" as const,
      network: networkId,
      price: "$0.01",
      payTo: MERCHANT_ADDRESS,
      extra: {
        escrowAddress: authCaptureEscrow,
        operatorAddress: ctx.operatorAddress,
        feeReceiver: ctx.operatorAddress,
        maxFeeBps: 500,
      },
    }],
    ...declareOfferReceiptExtension({ includeTxHash: true }),
    ...declareAttestationExtension(),
  },
}, resourceServer));

app.get("/weather", (_req, res) => {
  res.json({ location: "San Francisco", temperature: 68, conditions: "Partly cloudy", timestamp: new Date().toISOString() });
});

app.get("/garbage", (_req, res) => {
  res.json({ error: "Internal Server Error", message: "Something went wrong", code: 500 });
});

app.listen(PORT, () => {
  console.log(`[merchant] Running on :${PORT} (JWS receipts)`);
  console.log(`[merchant] Pay to: ${MERCHANT_ADDRESS}, Operator: ${ctx.operatorAddress}`);
  console.log(`[merchant] Arbiter: ${ARBITER_URL}`);
});
