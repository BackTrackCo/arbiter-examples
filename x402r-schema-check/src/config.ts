import type { Address, Chain } from "viem";
import { extractChain } from "viem";
import * as viemChains from "viem/chains";
import { readFileSync } from "node:fs";
import { getChainConfig } from "@x402r/sdk";

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
// Schema check — where the verdict comes from, and the rules it applies
// ---------------------------------------------------------------------------

export interface SchemaCheckSettings {
  /** Ergonia origin that renders the verdict. */
  ergoniaUrl: string;
  /** Bearer for POST /api/check. Registration is free: POST /api/register. */
  ergoniaKey: string;
  /** The rules, published before any payment: the merchant is judged against them. */
  spec: unknown;
  /** Where the rules were read from, for logs. */
  specFile: string;
}

/**
 * ERGONIA_URL  origin of the checker (default https://ergonia.works)
 * ERGONIA_KEY  an Ergonia member key, erg_sk_... (required)
 * SPEC_FILE    path to the JSON rules (default ./spec.json)
 */
export function loadSchemaCheckSettings(): SchemaCheckSettings {
  const ergoniaUrl = (process.env.ERGONIA_URL ?? "https://ergonia.works").replace(/\/$/, "");
  const ergoniaKey = process.env.ERGONIA_KEY;
  if (!ergoniaKey) {
    throw new Error("ERGONIA_KEY required: register once with POST https://ergonia.works/api/register and keep the erg_sk_ key it returns");
  }
  const specFile = process.env.SPEC_FILE ?? "spec.json";
  let spec: unknown;
  try {
    spec = JSON.parse(readFileSync(specFile, "utf-8"));
  } catch (err) {
    throw new Error(`SPEC_FILE ${specFile} is not readable JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { ergoniaUrl, ergoniaKey, spec, specFile };
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)
export const CONTEXT_FILE = "context.json";
