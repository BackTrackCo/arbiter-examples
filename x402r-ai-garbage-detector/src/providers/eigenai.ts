import type { LocalAccount } from "viem/accounts";
import { type InferenceProvider, type InferenceResult, type ChatCompletionResponse, extractContent } from "./types.js";

function stripTags(text: string): string {
  let cleaned = text.replace(/^<\|channel\|>.*?<\|message\|>/s, "");
  cleaned = cleaned.replace(/<\|end\|>$/s, "");
  return cleaned.trim();
}

/**
 * EigenAI deterministic inference via wallet-grant auth.
 * Requires access to determinal-api.eigenarcade.com (currently unavailable).
 */
export class EigenAIProvider implements InferenceProvider {
  readonly name: string;
  private grantServer: string;
  private model: string;
  private account: LocalAccount;

  constructor(account: LocalAccount, grantServer: string, model = "gpt-oss-120b-f16") {
    this.account = account;
    this.grantServer = grantServer;
    this.model = model;
    this.name = `eigenai/${this.model}`;
  }

  private async getGrant() {
    const msgRes = await fetch(`${this.grantServer}/message?address=${this.account.address}`);
    if (!msgRes.ok) throw new Error(`Grant message request failed: ${msgRes.status}`);
    const msgData = (await msgRes.json()) as { success: boolean; message: string };
    const signature = await this.account.signMessage({ message: msgData.message });
    return { message: msgData.message, signature };
  }

  async evaluate(
    systemPrompt: string,
    userPrompt: string,
    seed: number,
  ): Promise<InferenceResult> {
    const grant = await this.getGrant();
    const res = await fetch(`${this.grantServer}/api/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        temperature: 0,
        seed,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        grantMessage: grant.message,
        grantSignature: grant.signature,
        walletAddress: this.account.address,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`EigenAI request failed (${res.status}): ${errText}`);
    }
    const data = (await res.json()) as ChatCompletionResponse;
    const rawResponse = extractContent(data);
    return { rawResponse, displayContent: stripTags(rawResponse) };
  }
}
