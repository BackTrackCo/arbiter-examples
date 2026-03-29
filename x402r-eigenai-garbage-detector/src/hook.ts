import type { SettleResultContext } from "@x402/core/server";

/**
 * Creates an `onAfterSettle` hook that forwards the response body + paymentInfo
 * to the garbage detection arbiter. Fire-and-forget — does not block the response.
 *
 * Extends `@x402r/helpers` `forwardToArbiter()` by also forwarding `paymentInfo`
 * from the escrow payload, which the arbiter needs to call `release()` on PASS.
 *
 * TODO: Remove this once `@x402r/helpers` adds `paymentInfo` forwarding.
 */
export function forwardToArbiter(arbiterUrl: string) {
  return async (context: SettleResultContext): Promise<void> => {
    if (!context.result.success) return;
    if (context.requirements.scheme !== "escrow") return;

    const transportCtx = context.transportContext as
      | { responseBody?: { toString(encoding: string): string } }
      | undefined;
    const responseBody = transportCtx?.responseBody;
    if (!responseBody) return;

    // Extract paymentInfo from the escrow payload so the arbiter can release funds
    const escrowPayload = context.paymentPayload.payload as Record<string, unknown>;
    const paymentInfo = escrowPayload?.paymentInfo ?? null;

    fetch(`${arbiterUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseBody: responseBody.toString("utf-8"),
        network: context.requirements.network,
        transaction: context.result.transaction,
        scheme: "escrow",
        paymentInfo,
      }),
    }).catch((err) => console.error("[forwardToArbiter] arbiter post failed:", err));
  };
}
