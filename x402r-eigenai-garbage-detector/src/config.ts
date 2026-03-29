import type { Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import type { InferenceProvider } from "./providers/types.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { OllamaProvider } from "./providers/ollama.js";
import { ClawRouterProvider } from "./providers/clawrouter.js";
import { EigenAIProvider } from "./providers/eigenai.js";

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export const CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC =
  process.env.BASE_SEPOLIA_RPC ?? undefined; // uses viem default if unset

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// ---------------------------------------------------------------------------
// Inference provider
// ---------------------------------------------------------------------------

export type ProviderType = "openai" | "ollama" | "clawrouter" | "eigenai";

export const INFERENCE_SEED = Number(process.env.INFERENCE_SEED ?? 42);

/**
 * Create an inference provider from environment variables.
 *
 * INFERENCE_PROVIDER = "openai" | "ollama" | "eigenai"
 *
 * openai:      Any OpenAI-compatible API (OpenAI, OpenRouter, Together, vLLM, etc.)
 *              OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o-mini), OPENAI_BASE_URL
 * ollama:      OLLAMA_MODEL (default llama3.1:8b), OLLAMA_BASE_URL (default localhost:11434)
 * clawrouter:  Pays for inference with USDC via x402 — no API key needed, uses arbiter wallet
 *              CLAWROUTER_MODEL (default blockrun/auto), CLAWROUTER_BASE_URL
 * eigenai:     EIGENAI_GRANT_SERVER, EIGENAI_MODEL — requires wallet account for grant auth
 */
export function createProvider(account?: LocalAccount): InferenceProvider {
  const type = (process.env.INFERENCE_PROVIDER ?? "openai") as ProviderType;

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
      return new OllamaProvider({
        model: process.env.OLLAMA_MODEL,
        baseUrl: process.env.OLLAMA_BASE_URL,
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
      throw new Error(`Unknown INFERENCE_PROVIDER: ${type}. Use openai, ollama, clawrouter, or eigenai.`);
  }
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)
export const CONTEXT_FILE = "context.json";
