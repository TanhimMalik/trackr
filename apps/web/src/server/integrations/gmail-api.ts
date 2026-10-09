import "server-only";
import type { Fetch } from "./google-oauth";
import type { GmailMessage } from "./gmail-message";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const RETRIES = 3;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

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
  constructor(readonly status: number) {
    super(`Gmail is temporarily unavailable (${status})`);
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
    let response = await send(url);
    // Gmail allows a limited number of requests per second; wait and retry.
    for (
      let attempt = 1;
      attempt <= RETRIES && RETRYABLE.has(response.status);
      attempt++
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt,
      );
      response = await send(url);
    }
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { errors?: { reason?: string }[] };
    };
    const reason = body.error?.errors?.[0]?.reason;
    if (response.status === 401) throw new GmailUnauthorizedError();
    if (response.status === 403 && reason === "accessNotConfigured") {
      throw new GmailApiDisabledError();
    }
    if (response.status === 404 && path === "/history")
      throw new GmailHistoryExpiredError();
    throw new GmailTemporaryError(response.status);
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
