import type { SubmissionIntent, SubmissionOutcome } from "@trackr/domain";
import { guessJobFromPage, type PageMetadata } from "../shared/submission";
import type { JobDraft, PopupState, TrackResult } from "../shared/types";
import type { TriageRun } from "../shared/triage";
import { h, openTab, present, send } from "./dom";
import { renderTriage, startTriage } from "./triage";

const app = document.getElementById("app")!;
const status = document.getElementById("status")!;

const DUPLICATE: [string, string] = [
  "Added for review",
  "It looks like one you already track, so Trackr asks you to confirm.",
];

const OUTCOME_MESSAGES: Record<
  SubmissionIntent,
  Record<SubmissionOutcome, [string, string]>
> = {
  APPLIED: {
    CREATED: ["Added to Trackr", "It's on your board as Applied."],
    MATCHED_EXISTING: [
      "Already tracked",
      "Marked as applied on the existing application.",
    ],
    POSSIBLE_DUPLICATE: DUPLICATE,
  },
  SAVED: {
    CREATED: ["Saved to Trackr", "It's in Saved, ready for when you apply."],
    MATCHED_EXISTING: [
      "Already tracked",
      "Filled in anything the application was missing.",
    ],
    POSSIBLE_DUPLICATE: DUPLICATE,
  },
};

function trackedNotice(
  applicationId: string,
  outcome: SubmissionOutcome,
  intent: SubmissionIntent = "APPLIED",
) {
  const [title, detail] = OUTCOME_MESSAGES[intent][outcome];
  return h(
    "div",
    {
      className: `notice ${outcome === "POSSIBLE_DUPLICATE" ? "warning" : "success"}`,
    },
    h("strong", {}, title),
    h("p", {}, detail),
    h(
      "button",
      {
        type: "button",
        className: "link",
        onclick: openTab(
          outcome === "POSSIBLE_DUPLICATE"
            ? "/activity?tab=review"
            : `/applications/${applicationId}`,
        ),
      },
      "Open in Trackr ↗",
    ),
  );
}

/** Reads the open page's title and metadata; only possible because the popup was opened on it. */
async function readPage(tabId: number): Promise<JobDraft | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (): PageMetadata => {
        const meta = (key: string) =>
          document
            .querySelector<HTMLMetaElement>(
              `meta[property="${key}"], meta[name="${key}"]`,
            )
            ?.content?.trim() || null;
        return {
          url: location.href,
          title: document.title,
          ogTitle: meta("og:title"),
          siteName: meta("og:site_name"),
          jsonLd: [
            ...document.querySelectorAll('script[type="application/ld+json"]'),
          ]
            .map((script) => (script.textContent ?? "").slice(0, 200_000))
            .slice(0, 10),
        };
      },
    });
    return result?.result ? guessJobFromPage(result.result) : null;
  } catch {
    // Browser pages and the web store can't be read.
    return null;
  }
}

function field(label: string, name: string, value: string, type = "text") {
  return h(
    "label",
    {},
    label,
    h("input", { name, value, type, required: true, autocomplete: "off" }),
  );
}

function renderDisconnected(state: PopupState) {
  app.replaceChildren(
    ...present(
      h(
        "p",
        {},
        "Connect your Trackr account, and applications you submit on Greenhouse, Lever and Ashby are added automatically.",
      ),
      state.pendingSubmissions > 0 &&
        h(
          "p",
          { className: "notice warning" },
          `${state.pendingSubmissions} application${state.pendingSubmissions === 1 ? " is" : "s are"} waiting to be sent.`,
        ),
      h(
        "button",
        {
          type: "button",
          onclick: () =>
            void send({ type: "CONNECT" }).then(() => window.close()),
        },
        "Connect account",
      ),
    ),
  );
}

function triageEntry(windowId: number | null, last: TriageRun | null) {
  if (windowId === null) return null;
  const back = () => void render();
  return h(
    "section",
    { className: "triage-entry" },
    h("strong", {}, "Too many job tabs open?"),
    h(
      "p",
      { className: "muted" },
      "Score the job posts in this window against your resume, keep the best, and close the rest.",
    ),
    h(
      "div",
      { className: "actions" },
      h(
        "button",
        {
          type: "button",
          className: "secondary",
          onclick: () => void startTriage(app, windowId, back),
        },
        "Triage open tabs",
      ),
      last &&
        h(
          "button",
          {
            type: "button",
            className: "secondary",
            onclick: () =>
              renderTriage(app, last, {
                back,
                again: () => void startTriage(app, windowId, back),
              }),
          },
          "Last results",
        ),
    ),
  );
}

function renderConnected(
  state: PopupState,
  tabId: number | null,
  windowId: number | null,
  last: TriageRun | null,
) {
  const account = state.account?.isDemo
    ? "Demo workspace"
    : (state.account?.email ?? "your account");
  const message = h("p", { className: "muted" });
  const job = state.job;

  const form = h(
    "form",
    {},
    field("Company", "companyName", job?.companyName ?? ""),
    field("Role", "jobTitle", job?.jobTitle ?? ""),
    field("Job link", "jobUrl", job?.jobUrl ?? "", "url"),
    h(
      "div",
      { className: "actions" },
      h(
        "button",
        { type: "submit", value: "APPLIED", title: "You've applied" },
        "Track application",
      ),
      h(
        "button",
        {
          type: "submit",
          value: "SAVED",
          className: "secondary",
          title: "You'll apply later",
        },
        "Save for later",
      ),
    ),
  );
  const buttons = [...form.querySelectorAll("button")];
  const labels = buttons.map((button) => button.textContent);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const pressed = (event as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const intent = (pressed?.value ?? "APPLIED") as SubmissionIntent;
    const data = new FormData(form);
    const draft: JobDraft = {
      ...job,
      companyName: String(data.get("companyName") ?? ""),
      jobTitle: String(data.get("jobTitle") ?? ""),
      jobUrl: String(data.get("jobUrl") ?? ""),
    };
    // A link edited by hand may no longer be the detected posting.
    if (draft.jobUrl !== job?.jobUrl) {
      delete draft.platform;
      delete draft.atsJobId;
    }
    for (const button of buttons) button.disabled = true;
    if (pressed) {
      pressed.textContent = intent === "SAVED" ? "Saving…" : "Tracking…";
    }
    const result = await send<TrackResult>({
      type: "TRACK",
      tabId,
      job: draft,
      intent,
    });
    if (result.ok) {
      form.replaceWith(
        trackedNotice(result.applicationId, result.outcome, result.intent),
      );
      message.remove();
    } else {
      buttons.forEach((button, index) => {
        button.disabled = false;
        button.textContent = labels[index]!;
      });
      message.className = result.queued ? "notice warning" : "error";
      message.textContent = result.error;
    }
  };

  app.replaceChildren(
    ...present(
      h("p", { className: "muted" }, `Connected to ${account}.`),
      state.tracked
        ? trackedNotice(
            state.tracked.applicationId,
            state.tracked.outcome,
            state.tracked.intent,
          )
        : form,
      message,
      triageEntry(windowId, last),
      state.pendingSubmissions > 0 &&
        h(
          "p",
          { className: "muted" },
          `${state.pendingSubmissions} waiting to sync. Trackr retries automatically.`,
        ),
      h(
        "div",
        { className: "footer" },
        h(
          "button",
          { type: "button", className: "link", onclick: openTab("/overview") },
          "Open Trackr ↗",
        ),
        h(
          "button",
          {
            type: "button",
            className: "link quiet",
            onclick: async () => {
              await send({ type: "DISCONNECT" });
              await render();
            },
          },
          "Disconnect",
        ),
      ),
    ),
  );
}

async function render() {
  document.body.classList.remove("wide");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id ?? null;
  const windowId = tab?.windowId ?? null;
  const pageJob = tabId === null ? null : await readPage(tabId);
  const state = await send<PopupState>({
    type: "GET_POPUP_STATE",
    tabId: tabId ?? -1,
    pageJob,
  });

  status.hidden = false;
  status.dataset.connected = String(state.connected);
  status.textContent = state.connected ? "Connected" : "Not connected";
  if (state.connected) {
    const last =
      windowId === null
        ? null
        : await send<TriageRun | null>({ type: "TRIAGE_LAST", windowId });
    renderConnected(state, tabId, windowId, last);
  } else renderDisconnected(state);
}

render().catch(() => {
  app.replaceChildren(
    h(
      "p",
      { className: "error" },
      "Something went wrong. Close and reopen Trackr.",
    ),
  );
});
