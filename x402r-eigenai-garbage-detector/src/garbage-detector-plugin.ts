import type { X402r, PaymentInfo } from "@x402r/sdk";
import type { Hash } from "viem";

export interface GarbageDetectorActions {
  garbageDetector: {
    release(paymentInfo: PaymentInfo, amount?: bigint): Promise<Hash>;
  };
}

export function garbageDetectorActions(client: X402r): GarbageDetectorActions {
  return {
    garbageDetector: {
      release(paymentInfo, amount) {
        return client.payment.release(paymentInfo, amount ?? paymentInfo.maxAmount);
      },
    },
  };
}
