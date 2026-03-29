import type { InferenceProvider, InferenceResult } from "./types.js";

export class OllamaProvider implements InferenceProvider {
  readonly name: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { model?: string; baseUrl?: string }) {
    this.model = opts?.model ?? "llama3.1:8b";
    this.baseUrl = (opts?.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.name = `ollama/${this.model}`;
  }

  async evaluate(
    systemPrompt: string,
    userPrompt: string,
    seed: number,
  ): Promise<InferenceResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: { seed, temperature: 0 },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama request failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const rawResponse = data.message?.content ?? "";
    return { rawResponse, displayContent: rawResponse };
  }
}
