import type {
  ExtensionSubmissionPayload,
  ExtensionSubmissionResponse,
} from "@trackr/domain";
import { OUTBOX_MAX_AGE_MS, retryDelayMs } from "../shared/submission";
import { apiFetch } from "./auth";

type Queued = {
  payload: ExtensionSubmissionPayload;
  tabId: number | null;
  attempts: number;
  nextAttemptAt: number;
  queuedAt: number;
};

const KEY = "outbox";
const ALARM = "trackr-outbox";

export type SendResult =
  | { status: "sent"; response: ExtensionSubmissionResponse }
  | { status: "retry" }
  | { status: "rejected" };

/** Sends one submission. Network trouble, rate limits and server errors are retryable. */
export async function sendSubmission(
  payload: ExtensionSubmissionPayload,
): Promise<SendResult> {
  let response: Response;
  try {
    response = await apiFetch("/api/extension/applications", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    // Offline, or not connected yet: keep it for later.
    return { status: "retry" };
  }
  if (response.ok) {
    return {
      status: "sent",
      response: (await response.json()) as ExtensionSubmissionResponse,
    };
  }
  return response.status === 400 ? { status: "rejected" } : { status: "retry" };
}

async function load(): Promise<Queued[]> {
  return ((await chrome.storage.local.get(KEY))[KEY] as Queued[]) ?? [];
}

async function save(queue: Queued[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: queue });
  if (queue.length > 0) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(ALARM);
  }
}

export const isOutboxAlarm = (alarm: chrome.alarms.Alarm) =>
  alarm.name === ALARM;

export async function pendingCount(): Promise<number> {
  return (await load()).length;
}

/** Keeps a submission to retry later. Its id makes retries safe. */
export async function enqueue(
  payload: ExtensionSubmissionPayload,
  tabId: number | null,
): Promise<void> {
  const now = Date.now();
  const queue = await load();
  queue.push({
    payload,
    tabId,
    attempts: 1,
    nextAttemptAt: now + retryDelayMs(1),
    queuedAt: now,
  });
  await save(queue);
}

let flushing: Promise<void> | null = null;

/** Retries whatever is due. `onSent` hears about each one that goes through. */
export function flushOutbox(
  onSent: (
    item: Queued,
    response: ExtensionSubmissionResponse,
  ) => Promise<void>,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  flushing ??= (async () => {
    const now = Date.now();
    const remaining: Queued[] = [];
    for (const item of await load()) {
      if (now - item.queuedAt > OUTBOX_MAX_AGE_MS) continue;
      if (!force && item.nextAttemptAt > now) {
        remaining.push(item);
        continue;
      }
      const result = await sendSubmission(item.payload);
      if (result.status === "sent") await onSent(item, result.response);
      else if (result.status === "retry") {
        const attempts = item.attempts + 1;
        remaining.push({
          ...item,
          attempts,
          nextAttemptAt: now + retryDelayMs(attempts),
        });
      }
    }
    await save(remaining);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
