import express from "express";
import cors from "cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { EscrowServerScheme } from "@x402r/evm/escrow/server";
import {
  createEIP712OfferReceiptIssuer,
  createOfferReceiptExtension,
  declareOfferReceiptExtension,
} from "@x402/extensions/offer-receipt";
import { getChainConfig } from "@x402r/sdk";
import { forwardToArbiter } from "./hook.js";
import { CHAIN_ID } from "./config.js";
import { createClients, loadContext } from "./scripts/shared.js";

// ---------------------------------------------------------------------------
// Merchant: x402 payment middleware + offer-receipt + garbage detection hook
//
// Usage: FACILITATOR_URL=http://localhost:4022 pnpm run merchant
// ---------------------------------------------------------------------------

const { account } = createClients();
const PORT = Number(process.env.MERCHANT_PORT ?? 4021);
const FACILITATOR_URL = process.env.FACILITATOR_URL;
if (!FACILITATOR_URL) throw new Error("FACILITATOR_URL env required");
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";
const networkId = `eip155:${CHAIN_ID}` as const;

const ctx = loadContext();
const { authCaptureEscrow } = getChainConfig(CHAIN_ID);

// EIP-712 receipt issuer — signs delivery receipts with the merchant's key
const issuer = createEIP712OfferReceiptIssuer(
  `did:pkh:eip155:${CHAIN_ID}:${account.address}`,
  (params) => account.signTypedData(params),
);

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(networkId, new EscrowServerScheme())
  .registerExtension(createOfferReceiptExtension(issuer))
  .onAfterSettle(forwardToArbiter(ARBITER_URL));

const app = express();
app.use(cors());

app.use(paymentMiddleware({
  "GET /weather": {
    accepts: [{
      scheme: "escrow" as const,
      network: networkId,
      price: "$0.01",
      payTo: account.address,
      extra: {
        escrowAddress: authCaptureEscrow,
        operatorAddress: ctx.operatorAddress,
        feeReceiver: ctx.operatorAddress,
        maxFeeBps: 500,
      },
    }],
    ...declareOfferReceiptExtension({ includeTxHash: true }),
  },
  "GET /garbage": {
    accepts: [{
      scheme: "escrow" as const,
      network: networkId,
      price: "$0.01",
      payTo: account.address,
      extra: {
        escrowAddress: authCaptureEscrow,
        operatorAddress: ctx.operatorAddress,
        feeReceiver: ctx.operatorAddress,
        maxFeeBps: 500,
      },
    }],
    ...declareOfferReceiptExtension({ includeTxHash: true }),
  },
}, resourceServer));

app.get("/weather", (_req, res) => {
  res.json({ location: "San Francisco", temperature: 68, conditions: "Partly cloudy", timestamp: new Date().toISOString() });
});

app.get("/garbage", (_req, res) => {
  res.json({ error: "Internal Server Error", message: "Something went wrong", code: 500 });
});

app.listen(PORT, () => {
  console.log(`[merchant] Running on :${PORT}`);
  console.log(`[merchant] Pay to: ${account.address}, Operator: ${ctx.operatorAddress}`);
  console.log(`[merchant] Arbiter: ${ARBITER_URL}`);
  console.log(`[merchant] Receipt signing: EIP-712`);
});
