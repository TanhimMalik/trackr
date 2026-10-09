import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  LLM_SYSTEM_PROMPT,
  llmOutputSchema,
  llmUserPrompt,
  type EmailContent,
  type LlmOutput,
} from "@trackr/domain";
import type { EmailLlmConfig } from "@/server/env";

/** US dollars per million tokens, input and output. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 3, output: 15 },
};

/** The model failed, timed out or refused: classify on rules and try later. */
export class LlmUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`Email model unavailable (${code})`);
    this.name = "LlmUnavailableError";
  }
}

export type LlmResult = {
  output: LlmOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type EmailLlm = (
  email: EmailContent,
  receivedAt?: Date,
) => Promise<LlmResult>;

/**
 * One structured call per email: no tools, a fixed schema, validated before
 * use. A malformed answer gets one retry; anything else is unavailable.
 */
export function emailLlm(
  config: EmailLlmConfig,
  client: Pick<Anthropic, "messages"> = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 2,
    timeout: 30_000,
  }),
): EmailLlm {
  const price = PRICES[config.model];
  return async (email, receivedAt) => {
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response;
      try {
        response = await client.messages.parse({
          model: config.model,
          max_tokens: 1024,
          // A short judgment from the text in front of it: no thinking needed.
          thinking: { type: "disabled" },
          output_config: {
            effort: "low",
            format: zodOutputFormat(llmOutputSchema),
          },
          system: LLM_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: llmUserPrompt(email, receivedAt) },
          ],
        });
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new LlmUnavailableError(`api_${error.status ?? "connection"}`);
        }
        // The SDK throws when the answer doesn't parse: retry once.
        continue;
      }
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      if (response.stop_reason === "refusal") {
        throw new LlmUnavailableError("refusal");
      }
      const parsed = llmOutputSchema.safeParse(response.parsed_output);
      if (parsed.success) {
        return {
          output: parsed.data,
          model: config.model,
          inputTokens,
          outputTokens,
          costUsd: price
            ? (inputTokens * price.input + outputTokens * price.output) / 1e6
            : 0,
          latencyMs: Date.now() - started,
        };
      }
    }
    throw new LlmUnavailableError("invalid_output");
  };
}
