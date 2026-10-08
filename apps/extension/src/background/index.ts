import type {
  ExtensionSubmissionPayload,
  ExtensionSubmissionResponse,
} from "@trackr/domain";
import { TRACKR_URL } from "../shared/config";
import { buildSubmission } from "../shared/submission";
import type {
  ExternalMessage,
  Message,
  PopupState,
  TrackResult,
} from "../shared/types";
import { connectWithCode, disconnect, getAuth, refreshAccount } from "./auth";
import {
  enqueue,
  flushOutbox,
  isOutboxAlarm,
  pendingCount,
  sendSubmission,
} from "./outbox";
import {
  clearJob,
  forgetTab,
  getJob,
  getTracked,
  saveJob,
  setTracked,
} from "./storage";

async function flashBadge(tabId: number | null, text: string, color: string) {
  if (tabId === null) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 5000);
  } catch {
    // The tab was closed.
  }
}

async function recordSent(
  tabId: number | null,
  response: ExtensionSubmissionResponse,
) {
  if (tabId !== null) {
    await setTracked(tabId, response).catch(() => {});
    await flashBadge(tabId, "✓", "#16a34a");
  }
}

/** Sends a submission now, or queues it to retry when that isn't possible. */
async function submit(
  payload: ExtensionSubmissionPayload,
  tabId: number | null,
): Promise<TrackResult> {
  const result = await sendSubmission(payload);
  if (result.status === "sent") {
    await recordSent(tabId, result.response);
    return { ok: true, ...result.response };
  }
  if (result.status === "rejected") {
    return {
      ok: false,
      queued: false,
      error: "Trackr couldn't accept these details.",
    };
  }
  await enqueue(payload, tabId);
  const connected = (await getAuth()) !== null;
  await flashBadge(tabId, "…", "#64748b");
  return {
    ok: false,
    queued: true,
    error: connected
      ? "Trackr is unreachable. It will be sent automatically."
      : "Connect your account and it will be sent automatically.",
  };
}

/** An application went through on a supported job board in this tab. */
async function onApplicationSubmitted(tabId: number) {
  const job = await getJob(tabId);
  // Confirmation without a job seen earlier in the tab is never enough.
  if (!job) return;
  // Check the setting now, since it may have changed in Trackr; offline,
  // go by the last known value.
  const auth = (await refreshAccount().catch(() => null)) ?? (await getAuth());
  if (auth && !auth.autoTrack) return;
  await clearJob(tabId);
  await submit(buildSubmission(job, "AUTO"), tabId);
}

async function popupState(
  tabId: number,
  pageJob: PopupState["job"],
): Promise<PopupState> {
  const auth = await getAuth();
  let account = auth?.account ?? null;
  if (auth && !account) {
    account = (await refreshAccount().catch(() => null))?.account ?? null;
  }
  const connected = (await getAuth()) !== null;
  return {
    connected,
    account: connected ? account : null,
    job: (await getJob(tabId)) ?? pageJob,
    tracked: await getTracked(tabId),
    pendingSubmissions: await pendingCount(),
  };
}

async function handle(message: Message, sender: chrome.runtime.MessageSender) {
  switch (message.type) {
    case "JOB_CONTEXT":
      if (sender.tab?.id !== undefined)
        await saveJob(sender.tab.id, message.job);
      return null;
    case "APPLICATION_SUBMITTED":
      if (sender.tab?.id !== undefined)
        await onApplicationSubmitted(sender.tab.id);
      return null;
    case "GET_POPUP_STATE":
      return popupState(message.tabId, message.pageJob);
    case "TRACK":
      return submit(buildSubmission(message.job, "POPUP"), message.tabId);
    case "CONNECT":
      await chrome.tabs.create({
        url: `${TRACKR_URL}/extension/connect?ext=${chrome.runtime.id}`,
      });
      return null;
    case "DISCONNECT":
      await disconnect();
      return null;
  }
}

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // Only the extension's own pages and content scripts reach this listener.
    if (sender.id !== chrome.runtime.id) return false;
    handle(message, sender).then(sendResponse, () => sendResponse(null));
    return true;
  },
);

chrome.runtime.onMessageExternal.addListener(
  (message: ExternalMessage, sender, sendResponse) => {
    // Only the Trackr site may hand over a connect code.
    if (!sender.url || new URL(sender.url).origin !== TRACKR_URL) return false;
    if (
      message?.type !== "TRACKR_CONNECT" ||
      typeof message.code !== "string"
    ) {
      return false;
    }
    (async () => {
      const ok = await connectWithCode(message.code);
      if (ok) {
        await refreshAccount().catch(() => null);
        await flushOutbox(
          ({ tabId }, response) => recordSent(tabId, response),
          {
            force: true,
          },
        );
      }
      sendResponse({ ok });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (isOutboxAlarm(alarm)) {
    void flushOutbox(({ tabId }, response) => recordSent(tabId, response));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetTab(tabId);
});

chrome.runtime.onStartup.addListener(() => {
  void flushOutbox(({ tabId }, response) => recordSent(tabId, response));
});
