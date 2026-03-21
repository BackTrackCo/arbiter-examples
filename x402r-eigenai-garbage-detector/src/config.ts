import { type Address, type Hex } from "viem";
import { baseSepolia, base } from "viem/chains";

export const CHAIN_MAP = {
  84532: baseSepolia,
  8453: base,
} as const;

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`${key} env required`);
  return val;
}

export const PRIVATE_KEY = getEnv("PRIVATE_KEY") as Hex;
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 84532);
export const CHAIN = CHAIN_MAP[CHAIN_ID as keyof typeof CHAIN_MAP];
export const NETWORK_ID = `eip155:${CHAIN_ID}` as const;
export const EIGENAI_GRANT_SERVER = process.env.EIGENAI_GRANT_SERVER ?? "https://determinal-api.eigenarcade.com";
export const EIGENAI_MODEL = process.env.EIGENAI_MODEL ?? "gpt-oss-120b-f16";
export const EIGENAI_SEED = Number(process.env.EIGENAI_SEED ?? 42);
