import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  FIT_SYSTEM_PROMPT,
  fitOutputSchema,
  fitUserPrompt,
  LLM_SYSTEM_PROMPT,
  llmOutputSchema,
  llmUserPrompt,
  RESUME_SYSTEM_PROMPT,
  resumeProfileSchema,
  type EmailContent,
  type FitOutput,
  type FitPosting,
  type FitPreferences,
  type LlmOutput,
  type ResumeProfile,
} from "@trackr/domain";
import type { z } from "zod";
import type { LlmConfig } from "@/server/env";

/** US dollars per million tokens, input and output. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 3, output: 15 },
};

/** The model failed, timed out or refused: fall back, and try later. */
export class LlmUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`Model unavailable (${code})`);
    this.name = "LlmUnavailableError";
  }
}

export type LlmCall<T> = {
  output: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

type Client = Pick<Anthropic, "messages">;

const defaultClient = (config: LlmConfig): Client =>
  new Anthropic({ apiKey: config.apiKey, maxRetries: 2, timeout: 30_000 });

/**
 * One structured call: no tools, a fixed schema, validated before use. A
 * malformed answer gets one retry; anything else is unavailable.
 */
async function structuredCall<S extends z.ZodType>(
  client: Client,
  config: LlmConfig,
  {
    system,
    content,
    schema,
    maxTokens,
    effort,
  }: {
    system: string;
    content: Anthropic.MessageParam["content"];
    schema: S;
    maxTokens: number;
    effort: "low" | "medium";
  },
): Promise<LlmCall<z.output<S>>> {
  const price = PRICES[config.model];
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = await client.messages.parse({
        model: config.model,
        max_tokens: maxTokens,
        // A judgment from the text in front of it: no thinking needed.
        thinking: { type: "disabled" },
        output_config: { effort, format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content }],
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
    const parsed = schema.safeParse(response.parsed_output);
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
}

export type LlmResult = LlmCall<LlmOutput>;

export type EmailLlm = (
  email: EmailContent,
  receivedAt?: Date,
) => Promise<LlmResult>;

/** Classifies one email the rules couldn't settle. */
export function emailLlm(
  config: LlmConfig,
  client: Client = defaultClient(config),
): EmailLlm {
  return (email, receivedAt) =>
    structuredCall(client, config, {
      system: LLM_SYSTEM_PROMPT,
      content: llmUserPrompt(email, receivedAt),
      schema: llmOutputSchema,
      maxTokens: 1024,
      effort: "low",
    });
}

export type ResumeReader = (pdf: Buffer) => Promise<LlmCall<ResumeProfile>>;

/** Reads a resume PDF into a profile. The PDF goes to the model and nowhere else. */
export function resumeReader(
  config: LlmConfig,
  client: Client = defaultClient(config),
): ResumeReader {
  return (pdf) =>
    structuredCall(client, config, {
      system: RESUME_SYSTEM_PROMPT,
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdf.toString("base64"),
          },
        },
        { type: "text", text: "Summarize this resume." },
      ],
      schema: resumeProfileSchema,
      maxTokens: 4096,
      effort: "low",
    });
}

export type FitScorer = (input: {
  profile: ResumeProfile;
  preferences: FitPreferences;
  posting: FitPosting;
}) => Promise<LlmCall<FitOutput>>;

/** Rates how well one posting fits the profile; the score is computed from the ratings. */
export function fitScorer(
  config: LlmConfig,
  client: Client = defaultClient(config),
): FitScorer {
  return ({ profile, preferences, posting }) =>
    structuredCall(client, config, {
      system: FIT_SYSTEM_PROMPT,
      content: fitUserPrompt(profile, preferences, posting),
      schema: fitOutputSchema,
      maxTokens: 2048,
      effort: "medium",
    });
}
