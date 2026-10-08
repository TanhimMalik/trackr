import { TRACKR_URL } from "../shared/config";
import type { Account } from "../shared/types";

type Tokens = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

type AuthState = {
  tokens: Tokens;
  account: Account | null;
  autoTrack: boolean;
};

const KEY = "auth";
// Refresh a little early, so a token never expires mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

export class NotConnectedError extends Error {
  constructor() {
    super("Not connected to Trackr");
    this.name = "NotConnectedError";
  }
}

export async function getAuth(): Promise<AuthState | null> {
  return ((await chrome.storage.local.get(KEY))[KEY] as AuthState) ?? null;
}

async function saveAuth(state: AuthState | null): Promise<void> {
  if (state) await chrome.storage.local.set({ [KEY]: state });
  else await chrome.storage.local.remove(KEY);
}

async function requestTokens(body: object): Promise<Tokens | null> {
  const response = await fetch(`${TRACKR_URL}/api/extension/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 400) return null;
  if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
  return (await response.json()) as Tokens;
}

/** Trades the connect page's one-time code for tokens. */
export async function connectWithCode(code: string): Promise<boolean> {
  const tokens = await requestTokens({ grantType: "code", code });
  if (!tokens) return false;
  await saveAuth({ tokens, account: null, autoTrack: true });
  return true;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Rotates the refresh token. A rejected refresh token means the browser was
 * disconnected, so the extension forgets its tokens. Concurrent callers
 * share one refresh, because each refresh token works only once.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const state = await getAuth();
    if (!state) return null;
    const tokens = await requestTokens({
      grantType: "refresh",
      refreshToken: state.tokens.refreshToken,
    });
    if (!tokens) {
      await saveAuth(null);
      return null;
    }
    await saveAuth({ ...state, tokens });
    return tokens.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function accessToken(): Promise<string> {
  const state = await getAuth();
  if (!state) throw new NotConnectedError();
  const expiresAt = new Date(state.tokens.accessExpiresAt).getTime();
  if (expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return state.tokens.accessToken;
  }
  const refreshed = await refreshAccessToken();
  if (!refreshed) throw new NotConnectedError();
  return refreshed;
}

/** Calls the Trackr API as this browser, refreshing the token once on a 401. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = (token: string) =>
    fetch(`${TRACKR_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

  const response = await send(await accessToken());
  if (response.status !== 401) return response;
  const refreshed = await refreshAccessToken();
  if (!refreshed) throw new NotConnectedError();
  return send(refreshed);
}

/** Who the extension is connected as, and the settings it follows. */
export async function refreshAccount(): Promise<AuthState | null> {
  const response = await apiFetch("/api/extension/me");
  if (!response.ok) return null;
  const me = (await response.json()) as Account & {
    settings: { autoTrackSupportedSites: boolean };
  };
  const state = await getAuth();
  if (!state) return null;
  const next: AuthState = {
    ...state,
    account: { email: me.email, name: me.name, isDemo: me.isDemo },
    autoTrack: me.settings.autoTrackSupportedSites,
  };
  await saveAuth(next);
  return next;
}

/** Disconnects this browser on the server, then forgets the tokens. */
export async function disconnect(): Promise<void> {
  try {
    await apiFetch("/api/extension/disconnect", { method: "POST" });
  } catch {
    // Offline or already disconnected: forgetting the tokens is enough.
  }
  await saveAuth(null);
}
