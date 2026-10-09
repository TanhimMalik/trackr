import "server-only";
import type { Fetch } from "./google-oauth";
import type { GmailMessage } from "./gmail-message";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const RETRIES = 3;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

/** The Gmail API isn't enabled for the Google Cloud project behind this deployment. */
export class GmailApiDisabledError extends Error {
  constructor() {
    super("The Gmail API isn't enabled for this Google Cloud project");
    this.name = "GmailApiDisabledError";
  }
}

/** The access token was rejected; refreshing it may help. */
export class GmailUnauthorizedError extends Error {
  constructor() {
    super("Gmail rejected the access token");
    this.name = "GmailUnauthorizedError";
  }
}

/** The history cursor is too old; sync has to fall back to a dated search. */
export class GmailHistoryExpiredError extends Error {
  constructor() {
    super("The Gmail history cursor has expired");
    this.name = "GmailHistoryExpiredError";
  }
}

/** Rate limits, outages and timeouts: try again later. */
export class GmailTemporaryError extends Error {
  constructor(
    readonly status: number,
    readonly reason?: string,
  ) {
    super(
      `Gmail is temporarily unavailable (${status}${reason ? ` ${reason}` : ""})`,
    );
    this.name = "GmailTemporaryError";
  }
}

export type GmailClient = ReturnType<typeof gmailClient>;

/** A small, read-only Gmail client for one user's access token. */
export function gmailClient(
  accessToken: string,
  fetchImpl: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((done) => setTimeout(done, ms)),
) {
  const send = (url: URL) =>
    fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

  async function get<T>(
    path: string,
    params: Record<string, string | string[] | undefined> = {},
  ) {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(params)) {
      for (const item of [value].flat())
        if (item !== undefined) url.searchParams.append(key, item);
    }
    const reasonOf = async (response: Response) => {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { errors?: { reason?: string }[] };
      };
      return body.error?.errors?.[0]?.reason;
    };
    let response = await send(url);
    let reason: string | undefined;
    // Gmail allows a limited number of requests per second; wait and retry.
    // It reports going over as 429, or as 403 with a rate-limit reason.
    for (let attempt = 1; ; attempt++) {
      if (response.ok) return (await response.json()) as T;
      reason = await reasonOf(response);
      const limited =
        RETRYABLE.has(response.status) ||
        (response.status === 403 && RATE_LIMIT_REASONS.has(reason ?? ""));
      if (!limited || attempt > RETRIES) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt,
      );
      response = await send(url);
    }
    if (response.status === 401) throw new GmailUnauthorizedError();
    if (response.status === 403 && reason === "accessNotConfigured") {
      throw new GmailApiDisabledError();
    }
    if (response.status === 404 && path === "/history")
      throw new GmailHistoryExpiredError();
    throw new GmailTemporaryError(response.status, reason);
  }

  return {
    profile: () => get<{ historyId: string }>("/profile"),

    listMessages: (query: string, pageToken?: string, maxResults = 25) =>
      get<{
        messages?: { id: string; threadId: string }[];
        nextPageToken?: string;
      }>("/messages", { q: query, pageToken, maxResults: String(maxResults) }),

    listHistory: (startHistoryId: string, pageToken?: string) =>
      get<{
        history?: {
          messagesAdded?: { message: { id: string; threadId: string } }[];
        }[];
        historyId: string;
        nextPageToken?: string;
      }>("/history", {
        startHistoryId,
        pageToken,
        historyTypes: "messageAdded",
        maxResults: "100",
      }),

    /** Headers, labels and snippet only: no body. */
    metadata: (id: string) =>
      get<GmailMessage>(`/messages/${id}`, {
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date", "List-Unsubscribe"],
      }),

    full: (id: string) =>
      get<GmailMessage>(`/messages/${id}`, { format: "full" }),
  };
}
