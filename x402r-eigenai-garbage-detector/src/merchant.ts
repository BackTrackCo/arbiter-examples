import express from "express";
import cors from "cors";
import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { EscrowServerScheme } from "@x402r/evm/escrow/server";
import { refundable } from "@x402r/helpers";
import { forwardToArbiter } from "./hook.js";
import { PRIVATE_KEY, NETWORK_ID, getEnv } from "./config.js";

const account = privateKeyToAccount(PRIVATE_KEY);
const PORT = Number(process.env.MERCHANT_PORT ?? 4021);
const FACILITATOR_URL = getEnv("FACILITATOR_URL", "http://localhost:4022");
const ARBITER_URL = process.env.ARBITER_URL ?? "http://localhost:3001";
const OPERATOR_ADDRESS = getEnv("OPERATOR_ADDRESS") as Address;
const payTo = account.address;

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK_ID, new EscrowServerScheme())
  .onAfterSettle(forwardToArbiter(ARBITER_URL));

const app = express();
app.use(cors());

app.use(paymentMiddleware({
  "GET /weather": {
    accepts: [refundable({ scheme: "escrow", price: "$0.01", network: NETWORK_ID, payTo }, OPERATOR_ADDRESS)],
  },
  "GET /garbage": {
    accepts: [refundable({ scheme: "escrow", price: "$0.01", network: NETWORK_ID, payTo }, OPERATOR_ADDRESS)],
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
  console.log(`[merchant] Pay to: ${payTo}, Operator: ${OPERATOR_ADDRESS}`);
  console.log(`[merchant] Arbiter: ${ARBITER_URL}`);
});
