import type { X402r, PaymentInfo } from "@x402r/sdk";
import type { Hash } from "viem";
import type { InferenceProvider } from "./providers/types.js";
import { detectGarbage, type GarbageVerdict } from "./garbage-detector.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GarbageDetectorConfig {
  provider: InferenceProvider;
  seed: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface GarbageDetectorActions {
  garbageDetector: {
    /** Evaluate response body via configured inference provider. Returns PASS or FAIL with commitment. */
    evaluate(responseBody: string): Promise<GarbageVerdict>;
    /** Release escrowed funds (arbiter calls this when verdict is PASS). */
    capture(paymentInfo: PaymentInfo, amount?: bigint): Promise<Hash>;
    /** Evaluate + release in one call. Returns verdict; releases on PASS. */
    evaluateAndRelease(
      responseBody: string,
      paymentInfo: PaymentInfo,
      amount?: bigint,
    ): Promise<GarbageVerdict & { captureHash: Hash | null }>;
  };
}

// ---------------------------------------------------------------------------
// Plugin factory — accepts config, returns X402r extend fn
// ---------------------------------------------------------------------------

export function garbageDetectorActions(config: GarbageDetectorConfig) {
  return (client: X402r): GarbageDetectorActions => ({
    garbageDetector: {
      evaluate(responseBody) {
        return detectGarbage(config.provider, responseBody, config.seed);
      },

      capture(paymentInfo, amount) {
        return client.payment.capture(paymentInfo, amount ?? paymentInfo.maxAmount);
      },

      async evaluateAndRelease(responseBody, paymentInfo, amount) {
        const verdict = await detectGarbage(config.provider, responseBody, config.seed);
        let captureHash: Hash | null = null;
        if (verdict.verdict === "PASS") {
          captureHash = await client.payment.capture(
            paymentInfo,
            amount ?? paymentInfo.maxAmount,
          );
        }
        return { ...verdict, captureHash };
      },
    },
  });
}
