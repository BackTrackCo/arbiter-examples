import type { Address, Chain } from "viem";
import type { LocalAccount } from "viem/accounts";
import { extractChain } from "viem";
import * as viemChains from "viem/chains";
import { getChainConfig } from "@x402r/sdk";
import type { InferenceProvider } from "./providers/types.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { ClawRouterProvider } from "./providers/clawrouter.js";
import { EigenAIProvider } from "./providers/eigenai.js";

// ---------------------------------------------------------------------------
// Chains — supports multiple chains via comma-separated CHAIN_IDS env var
// ---------------------------------------------------------------------------

function parseChainIds(): number[] {
  const raw = process.env.CHAIN_IDS ?? process.env.CHAIN_ID ?? "84532";
  return raw.split(",").map((s) => Number(s.trim())).filter(Boolean);
}

export const CHAIN_IDS = parseChainIds();

/** Default chain for single-chain scripts (client, merchant, deploy). */
export const CHAIN_ID = CHAIN_IDS[0];

/** Resolve a viem Chain object from a chain ID. */
export function getViemChain(chainId: number): Chain {
  return extractChain({
    chains: Object.values(viemChains),
    id: chainId as any,
  });
}

/** Get USDC address for a chain from SDK config. */
export function getUsdcAddress(chainId: number): Address {
  return getChainConfig(chainId).usdc;
}

// ---------------------------------------------------------------------------
// Inference provider
// ---------------------------------------------------------------------------

export type ProviderType = "clawrouter" | "openai" | "ollama" | "eigenai";

export const INFERENCE_SEED = Number(process.env.INFERENCE_SEED ?? 42);

/**
 * Create an inference provider from environment variables.
 *
 * INFERENCE_PROVIDER = "clawrouter" | "openai" | "ollama" | "eigenai"
 *
 * clawrouter:  Pays for inference with USDC via x402 — no API key needed, uses arbiter wallet
 *              CLAWROUTER_MODEL (default openai/gpt-4o-mini), CLAWROUTER_BASE_URL
 * openai:      Any OpenAI-compatible API (OpenAI, OpenRouter, Together, vLLM, etc.)
 *              OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o-mini), OPENAI_BASE_URL
 * ollama:      Uses OpenAI-compatible endpoint at localhost:11434/v1 — no API key needed
 *              OLLAMA_MODEL (default llama3.1:8b), OLLAMA_BASE_URL
 * eigenai:     EIGENAI_GRANT_SERVER, EIGENAI_MODEL — requires wallet account for grant auth
 */
export function createProvider(account?: LocalAccount): InferenceProvider {
  const type = (process.env.INFERENCE_PROVIDER ?? "clawrouter") as ProviderType;

  switch (type) {
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY required when INFERENCE_PROVIDER=openai");
      return new OpenAICompatibleProvider({
        apiKey,
        model: process.env.OPENAI_MODEL,
        baseUrl: process.env.OPENAI_BASE_URL,
      });
    }

    case "ollama":
      return new OpenAICompatibleProvider({
        apiKey: "ollama",
        model: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
        baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      });

    case "clawrouter": {
      if (!account) throw new Error("Wallet account required for ClawRouter provider");
      return new ClawRouterProvider(account, {
        model: process.env.CLAWROUTER_MODEL,
        baseUrl: process.env.CLAWROUTER_BASE_URL,
      });
    }

    case "eigenai": {
      if (!account) throw new Error("Wallet account required for EigenAI provider");
      return new EigenAIProvider(
        account,
        process.env.EIGENAI_GRANT_SERVER ?? "https://determinal-api.eigenarcade.com",
        process.env.EIGENAI_MODEL ?? "gpt-oss-120b-f16",
      );
    }

    default:
      throw new Error(`Unknown INFERENCE_PROVIDER: ${type}. Use clawrouter, openai, ollama, or eigenai.`);
  }
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)
export const CONTEXT_FILE = "context.json";
