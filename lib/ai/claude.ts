import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * The only place in the application that talks to Anthropic.
 *
 * Imported by lib/ai/lead-analysis.ts, which is in turn imported only by the
 * "use server" action in app/(app)/leads/actions.ts. Nothing on this path is
 * reachable from the browser: the `server-only` import above turns any client
 * import into a build error rather than a leaked API key.
 */

/**
 * Model used for lead analysis.
 *
 * Defaults to Haiku: this is a bounded structured-classification task over a
 * handful of fields, which is the case Haiku is priced and tuned for. Opus or
 * Sonnet would cost materially more per lead without a corresponding gain in
 * what the task actually requires. Override with ANTHROPIC_MODEL.
 */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function getModel(): string {
  const configured = process.env.ANTHROPIC_MODEL?.trim();
  return configured && configured !== "" ? configured : DEFAULT_MODEL;
}

/**
 * The key is read at call time, not module load, so a missing key produces a
 * controlled error on the one request that needed it rather than breaking the
 * whole route at import.
 */
export function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key !== "" ? key : null;
}

export function isAiConfigured(): boolean {
  return getApiKey() !== null;
}

/** Failure modes the UI needs to distinguish. */
export type AiErrorKind =
  | "missing_key"
  | "rate_limited"
  | "timeout"
  | "overloaded"
  | "auth_failed"
  | "refused"
  | "bad_response";

export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Classifies an SDK failure.
 *
 * The original error is never re-thrown or returned to the caller: SDK errors
 * carry the request id, the endpoint, and sometimes the request body — all of
 * which would end up in the UI if this passed the message through. The kind is
 * the only thing that escapes.
 *
 * Order matters. The SDK's hierarchy is
 * `APIConnectionTimeoutError → APIConnectionError → APIError`, so testing the
 * base class first would swallow every connection failure and report it as a
 * bad response. Most specific first.
 */
function classify(error: unknown): AiError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("timeout", "The AI request timed out.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("overloaded", "Could not reach the AI service.");
  }

  if (error instanceof Anthropic.APIError) {
    // `status` is present on HTTP-level errors but not on connection ones.
    const status = typeof error.status === "number" ? error.status : null;

    if (status === 401 || status === 403) {
      return new AiError("auth_failed", "The AI service rejected our credentials.");
    }
    if (status === 429) {
      return new AiError("rate_limited", "The AI service is rate limiting requests.");
    }
    if (status === 529) {
      return new AiError("overloaded", "The AI service is temporarily overloaded.");
    }
    if (status !== null && status >= 500) {
      return new AiError("overloaded", "The AI service is temporarily unavailable.");
    }
    return new AiError("bad_response", "The AI service returned an unexpected response.");
  }

  return new AiError("bad_response", "The AI request failed.");
}

export interface ClaudeCompletion {
  /** The model's raw text — still unvalidated at this point. */
  text: string;
  /** True when the model declined, so the caller can say so precisely. */
  refused: boolean;
}

/**
 * One request, no retries.
 *
 * The SDK's own retry behaviour is disabled deliberately: the brief forbids
 * automatic retries for cost control, and a failed analysis is recoverable by
 * the user clicking Analyze again.
 */
export async function complete(
  system: string,
  userMessage: string,
): Promise<ClaudeCompletion> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiError("missing_key", "No Anthropic API key is configured.");
  }

  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: getModel(),
      // Conservative: the response is a small JSON object and the schema caps
      // every field. A high ceiling here would just be headroom for runaway
      // output that we would then discard.
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (error) {
    throw classify(error);
  }

  // A safety refusal arrives as a successful response with no usable content.
  if (message.stop_reason === "refusal") {
    return { text: "", refused: true };
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return { text, refused: false };
}
