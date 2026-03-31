import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerCommerceEvmScheme } from "@x402r/evm/commerce/facilitator";
import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID } from "./config.js";
import { getViemChain } from "./config.js";

// ---------------------------------------------------------------------------
// Local facilitator for testing — registers the x402r commerce scheme.
//
// Temporary: use until ultravioleta facilitator supports commerce scheme.
// Should eventually live in x402r-scheme/examples/facilitator/.
//
// Usage: pnpm run facilitator
// ---------------------------------------------------------------------------

const PORT = Number(process.env.FACILITATOR_PORT ?? 4022);

const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
if (!privateKey) { console.error("PRIVATE_KEY required"); process.exit(1); }

const account = privateKeyToAccount(privateKey);
const chain = getViemChain(CHAIN_ID);
const viemClient = createWalletClient({ account, chain, transport: http() }).extend(publicActions);

const evmSigner = toFacilitatorEvmSigner({
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  address: account.address,
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => viemClient.readContract({ ...args, args: args.args || [] }),
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }) => viemClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) => viemClient.writeContract({ ...args, args: args.args || [] }),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
});

const facilitator = new x402Facilitator();
registerCommerceEvmScheme(facilitator, {
  signer: evmSigner,
  networks: `eip155:${CHAIN_ID}`,
});

const app = express();
app.use(express.json());

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" }); return;
    }
    res.json(await facilitator.verify(paymentPayload, paymentRequirements));
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    if (!paymentPayload || !paymentRequirements) {
      res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" }); return;
    }
    res.json(await facilitator.settle(paymentPayload, paymentRequirements));
  } catch (error) {
    console.error("Settle error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});

app.listen(PORT, () => {
  console.log(`[facilitator] Commerce scheme on :${PORT} (chain ${CHAIN_ID})`);
  console.log(`[facilitator] Address: ${account.address}`);
});
