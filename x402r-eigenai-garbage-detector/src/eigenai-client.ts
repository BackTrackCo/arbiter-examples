import type { LocalAccount } from "viem/accounts";

export interface EigenAIResult {
  rawResponse: string;
  displayContent: string;
}

function stripTags(text: string): string {
  let cleaned = text.replace(/^<\|channel\|>.*?<\|message\|>/s, "");
  cleaned = cleaned.replace(/<\|end\|>$/s, "");
  return cleaned.trim();
}

export class EigenAIClient {
  private grantServer: string;
  private model: string;
  private account: LocalAccount;

  constructor(account: LocalAccount, grantServer: string, model = "gpt-oss-120b-f16") {
    this.account = account;
    this.grantServer = grantServer;
    this.model = model;
  }

  private async getGrant() {
    const msgRes = await fetch(`${this.grantServer}/message?address=${this.account.address}`);
    if (!msgRes.ok) throw new Error(`Grant message request failed: ${msgRes.status}`);
    const msgData = (await msgRes.json()) as { success: boolean; message: string };
    const signature = await this.account.signMessage({ message: msgData.message });
    return { message: msgData.message, signature };
  }

  async evaluate(systemPrompt: string, userPrompt: string, seed: number): Promise<EigenAIResult> {
    const grant = await this.getGrant();
    const res = await fetch(`${this.grantServer}/api/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
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
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawResponse = data.choices?.[0]?.message?.content ?? "";
    return { rawResponse, displayContent: stripTags(rawResponse) };
  }
}
