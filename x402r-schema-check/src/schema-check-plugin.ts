import type { X402r, PaymentInfo } from "@x402r/sdk";
import type { Hash } from "viem";
import type { SchemaCheckSettings } from "./config.js";
import { checkBody, type SchemaVerdict } from "./schema-check.js";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SchemaCheckActions {
  schemaCheck: {
    /** Judge a response body against the published rules. Throws when no verdict could be obtained. */
    evaluate(responseBody: string): Promise<SchemaVerdict>;
    /** Capture escrowed funds (arbiter calls this when verdict is PASS). */
    capture(paymentInfo: PaymentInfo, amount?: bigint): Promise<Hash>;
  };
}

// ---------------------------------------------------------------------------
// Plugin factory — accepts settings, returns X402r extend fn
// ---------------------------------------------------------------------------

export function schemaCheckActions(settings: SchemaCheckSettings) {
  return (client: X402r): SchemaCheckActions => ({
    schemaCheck: {
      evaluate(responseBody) {
        return checkBody(settings, responseBody);
      },

      capture(paymentInfo, amount) {
        return client.payment.capture(paymentInfo, amount ?? paymentInfo.maxAmount);
      },
    },
  });
}
