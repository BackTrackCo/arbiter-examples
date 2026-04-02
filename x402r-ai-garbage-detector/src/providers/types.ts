/**
 * Common interface for inference providers (OpenAI, Ollama, EigenAI).
 * The garbage detector only depends on this interface.
 */
export interface InferenceResult {
  rawResponse: string;
  displayContent: string;
}

/** OpenAI-compatible chat completion response shape. */
export interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Extract content from a chat completion response. */
export function extractContent(data: ChatCompletionResponse): string {
  return data.choices?.[0]?.message?.content ?? "";
}

export interface InferenceProvider {
  evaluate(
    systemPrompt: string,
    userPrompt: string,
    seed: number,
  ): Promise<InferenceResult>;

  /** Human-readable name for logging. */
  readonly name: string;
}
