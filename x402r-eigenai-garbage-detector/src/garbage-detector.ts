import { keccak256, toBytes, encodePacked, type Hex } from "viem";
import type { InferenceProvider } from "./providers/types.js";

const MAX_BODY_LENGTH = 4096;

export type VerdictResult = "PASS" | "FAIL";

export interface Commitment {
  promptHash: Hex;
  responseHash: Hex;
  commitmentHash: Hex;
  seed: number;
}

export interface GarbageVerdict {
  verdict: VerdictResult;
  reason: string;
  commitment: Commitment;
  raw: string;
}

const SYSTEM_PROMPT = `You are a response quality arbiter for an HTTP payment protocol. Your job is to determine if a paid API response is OBVIOUSLY broken, empty, error-like, placeholder, or gibberish.

You must respond with ONLY valid JSON in this exact format:
{"verdict": "PASS" | "FAIL", "reason": "one-line explanation"}

Rules:
- PASS: The response appears to contain real, substantive content relevant to what was requested.
- FAIL: The response is obviously broken. Examples:
  - Empty body or whitespace only
  - HTML error pages (404, 500, "Something went wrong")
  - Error JSON disguised as success ({"error": ...}, {"message": "Internal Server Error"})
  - Placeholder/lorem ipsum text
  - Gibberish or random characters
  - "Coming soon", "Under construction", "Not available"
  - Truncated responses that are clearly incomplete

Important:
- Set a LOW false-positive bar. Only FAIL things that are OBVIOUSLY broken.
- If the content looks like a real response with real data, PASS it even if quality seems low.
- Do NOT judge the factual accuracy or usefulness of the content — only whether it's garbage.
- Short but valid responses are fine (e.g., {"temperature": 72} is a PASS).`;

function createCommitment(prompt: string, seed: number, response: string): Commitment {
  const promptHash = keccak256(toBytes(prompt));
  const responseHash = keccak256(toBytes(response));
  const commitmentHash = keccak256(
    encodePacked(["bytes32", "bytes32", "uint256"], [promptHash, responseHash, BigInt(seed)]),
  );
  return { promptHash, responseHash, commitmentHash, seed };
}

function parseDecision(raw: string): { verdict: VerdictResult; reason: string } {
  const cleaned = raw.trim();
  try {
    const parsed = JSON.parse(cleaned) as { verdict?: string; reason?: string };
    if (parsed.verdict === "PASS" || parsed.verdict === "FAIL") {
      return { verdict: parsed.verdict, reason: parsed.reason ?? "No reason provided" };
    }
  } catch {
    const jsonMatch = cleaned.match(/\{[^}]*"verdict"\s*:\s*"(?:PASS|FAIL)"[^}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { verdict?: string; reason?: string };
        if (parsed.verdict === "PASS" || parsed.verdict === "FAIL") {
          return { verdict: parsed.verdict, reason: parsed.reason ?? "No reason provided" };
        }
      } catch { /* fall through */ }
    }
  }
  return { verdict: "PASS", reason: "Could not parse EigenAI response; defaulting to PASS" };
}

export async function detectGarbage(
  provider: InferenceProvider,
  responseBody: string,
  seed: number,
): Promise<GarbageVerdict> {
  const truncated = responseBody.length > MAX_BODY_LENGTH
    ? responseBody.slice(0, MAX_BODY_LENGTH) + "\n[... truncated]"
    : responseBody;
  const userPrompt = `Evaluate this HTTP response body:\n\n---\n${truncated}\n---`;

  const result = await provider.evaluate(SYSTEM_PROMPT, userPrompt, seed);
  const decision = parseDecision(result.displayContent);
  const fullPrompt = SYSTEM_PROMPT + "\n\n" + userPrompt;
  const commitment = createCommitment(fullPrompt, seed, result.rawResponse);

  return { verdict: decision.verdict, reason: decision.reason, commitment, raw: result.rawResponse };
}

export { SYSTEM_PROMPT, createCommitment, parseDecision };
