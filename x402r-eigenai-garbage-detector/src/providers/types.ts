/**
 * Common interface for inference providers (OpenAI, Ollama, EigenAI).
 * The garbage detector only depends on this interface.
 */
export interface InferenceResult {
  rawResponse: string;
  displayContent: string;
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
