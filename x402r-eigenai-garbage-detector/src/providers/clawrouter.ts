import type { LocalAccount } from "viem/accounts";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import type { InferenceProvider, InferenceResult } from "./types.js";

/**
 * ClawRouter provider — pays for inference with USDC via x402.
 *
 * No API key needed. The arbiter's existing wallet pays per-request.
 * Routes to 55+ models (OpenAI, Claude, Llama, Mistral, etc.)
 * with automatic smart routing or explicit model selection.
 *
 * @see https://github.com/BlockRunAI/ClawRouter
 */
export class ClawRouterProvider implements InferenceProvider {
  readonly name: string;
  private model: string;
  private baseUrl: string;
  private paidFetch: typeof fetch;

  constructor(account: LocalAccount, opts?: { model?: string; baseUrl?: string }) {
    this.model = opts?.model ?? "blockrun/auto";
    this.baseUrl = (opts?.baseUrl ?? "https://blockrun.ai/api/v1").replace(/\/$/, "");
    this.name = `clawrouter/${this.model}`;

    const signer = toClientEvmSigner(account);
    const client = new x402Client();
    client.register("eip155:8453", new ExactEvmScheme(signer));
    this.paidFetch = wrapFetchWithPayment(fetch, client);
  }

  async evaluate(
    systemPrompt: string,
    userPrompt: string,
    seed: number,
  ): Promise<InferenceResult> {
    const res = await this.paidFetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        seed,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ClawRouter request failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawResponse = data.choices?.[0]?.message?.content ?? "";
    return { rawResponse, displayContent: rawResponse };
  }
}
