import type { X402r, PaymentInfo } from "@x402r/sdk";
import type { Hash } from "viem";
import type { EigenAIClient } from "./eigenai-client.js";
import { detectGarbage, type GarbageVerdict } from "./garbage-detector.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GarbageDetectorConfig {
  eigenai: EigenAIClient;
  seed: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface GarbageDetectorActions {
  garbageDetector: {
    /** Evaluate response body via EigenAI. Returns PASS or FAIL with commitment. */
    evaluate(responseBody: string): Promise<GarbageVerdict>;
    /** Release escrowed funds (arbiter calls this when verdict is PASS). */
    release(paymentInfo: PaymentInfo, amount?: bigint): Promise<Hash>;
    /** Evaluate + release in one call. Returns verdict; releases on PASS. */
    evaluateAndRelease(
      responseBody: string,
      paymentInfo: PaymentInfo,
      amount?: bigint,
    ): Promise<GarbageVerdict & { releaseHash: Hash | null }>;
  };
}

// ---------------------------------------------------------------------------
// Plugin factory — accepts config, returns X402r extend fn
// ---------------------------------------------------------------------------

export function garbageDetectorActions(config: GarbageDetectorConfig) {
  return (client: X402r): GarbageDetectorActions => ({
    garbageDetector: {
      evaluate(responseBody) {
        return detectGarbage(config.eigenai, responseBody, config.seed);
      },

      release(paymentInfo, amount) {
        return client.payment.release(paymentInfo, amount ?? paymentInfo.maxAmount);
      },

      async evaluateAndRelease(responseBody, paymentInfo, amount) {
        const verdict = await detectGarbage(config.eigenai, responseBody, config.seed);
        let releaseHash: Hash | null = null;
        if (verdict.verdict === "PASS") {
          releaseHash = await client.payment.release(
            paymentInfo,
            amount ?? paymentInfo.maxAmount,
          );
        }
        return { ...verdict, releaseHash };
      },
    },
  });
}
