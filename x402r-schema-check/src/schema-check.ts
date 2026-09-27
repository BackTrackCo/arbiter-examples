import type { SchemaCheckSettings } from "./config.js";

// ---------------------------------------------------------------------------
// Deterministic delivery check: the response body is judged against rules
// the merchant published before being paid. No model is asked anything, so
// the same body and the same rules always give the same verdict, and anyone
// holding the body can re-run the check to confirm it.
//
// The verdict comes from Ergonia's schema-check@1 (POST /api/check), which
// also chains it in a public, append-only log: the spec, the SHA-256 of the
// body and every finding. The body itself is not published there.
// ---------------------------------------------------------------------------

export type VerdictResult = "PASS" | "FAIL";

export interface Finding {
  rule: string;
  ok: boolean;
  detail: string;
}

/** The public record of a verdict, readable by anyone without a key. */
export interface Receipt {
  /** Event id on Ergonia's log. */
  eventId: number;
  /** Hash of that event in the chain; GET <ergonia>/api/attest re-verifies the chain. */
  eventHash: string;
  /** URL returning exactly that event. */
  url: string;
  specSha256: string;
  bodySha256: string;
}

export interface SchemaVerdict {
  verdict: VerdictResult;
  reason: string;
  findings: Finding[];
  receipt: Receipt;
}

interface CheckResponse {
  check?: {
    event_id: number;
    event_hash: string;
    verdict: "pass" | "fail";
    findings: Finding[];
    spec_sha256: string;
    artifact_sha256: string;
    receipt: string;
  };
  error?: string;
}

const MAX_REASON = 500;

/**
 * Judge a response body. Throws when no verdict could be obtained (checker
 * unreachable, key refused, quota spent): the caller must then take no
 * on-chain action, and the escrow period returns the funds to the payer.
 * An unreachable checker is never read as a PASS.
 */
export async function checkBody(settings: SchemaCheckSettings, body: string): Promise<SchemaVerdict> {
  const res = await fetch(`${settings.ergoniaUrl}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${settings.ergoniaKey}` },
    body: JSON.stringify({ spec: settings.spec, artifact: body }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await res.json().catch(() => ({}))) as CheckResponse;
  if (res.status !== 201 || !payload.check) {
    throw new Error(`no verdict from ${settings.ergoniaUrl}/api/check: HTTP ${res.status}${payload.error ? `, ${payload.error}` : ""}`);
  }
  const c = payload.check;
  const failed = c.findings.filter((f) => !f.ok);
  const reason =
    c.verdict === "pass"
      ? `all ${c.findings.length} rules hold`
      : failed.map((f) => `${f.rule}: ${f.detail}`).join("; ").slice(0, MAX_REASON);
  return {
    verdict: c.verdict === "pass" ? "PASS" : "FAIL",
    reason,
    findings: c.findings,
    receipt: {
      eventId: c.event_id,
      eventHash: c.event_hash,
      url: c.receipt,
      specSha256: c.spec_sha256,
      bodySha256: c.artifact_sha256,
    },
  };
}

/** SHA-256 of a string as lowercase hex, the digest the receipt records. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What a payer, a merchant or a stranger does to confirm a verdict without
 * trusting the arbiter: read the public receipt, check it records the body
 * they hold, and read the verdict from the log rather than from the arbiter.
 */
export async function confirmReceipt(receiptUrl: string, body: string): Promise<{ verdict: string; bodyMatches: boolean }> {
  const res = await fetch(receiptUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`receipt ${receiptUrl}: HTTP ${res.status}`);
  const data = (await res.json()) as { events?: Array<{ kind: string; payload: { verdict: string; artifact_sha256: string } }> };
  const event = data.events?.[0];
  if (!event || event.kind !== "check") throw new Error(`receipt ${receiptUrl} does not point at a check event`);
  return { verdict: event.payload.verdict, bodyMatches: event.payload.artifact_sha256 === (await sha256Hex(body)) };
}
