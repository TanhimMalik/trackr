import type { SubmissionOutcome } from "@trackr/domain";
import { TRACKR_URL } from "../shared/config";
import { guessJobFromPage, type PageMetadata } from "../shared/submission";
import type {
  JobDraft,
  Message,
  PopupState,
  TrackResult,
} from "../shared/types";

const app = document.getElementById("app")!;
const status = document.getElementById("status")!;

const send = <T>(message: Message) =>
  chrome.runtime.sendMessage(message) as Promise<T>;

/** Builds an element; strings become text, never HTML. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & {
    dataset?: Record<string, string>;
  } = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const element = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(element.dataset, dataset);
  for (const child of children) if (child) element.append(child);
  return element;
}

/** Children for replaceChildren, leaving out the ones that don't apply. */
const present = (...nodes: (Node | false | null)[]) =>
  nodes.filter((node): node is Node => Boolean(node));

const openTab = (path: string) => () =>
  void chrome.tabs.create({ url: `${TRACKR_URL}${path}` });

const OUTCOME_MESSAGES: Record<SubmissionOutcome, [string, string]> = {
  CREATED: ["Added to Trackr", "It's on your board as Applied."],
  MATCHED_EXISTING: [
    "Already tracked",
    "Marked as applied on the existing application.",
  ],
  POSSIBLE_DUPLICATE: [
    "Added for review",
    "It looks like one you already track, so Trackr asks you to confirm.",
  ],
};

function trackedNotice(applicationId: string, outcome: SubmissionOutcome) {
  const [title, detail] = OUTCOME_MESSAGES[outcome];
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

function renderConnected(state: PopupState, tabId: number | null) {
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
    h("button", { type: "submit" }, "Track application"),
  );
  form.onsubmit = async (event) => {
    event.preventDefault();
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
    const button = form.querySelector("button")!;
    button.disabled = true;
    button.textContent = "Tracking…";
    const result = await send<TrackResult>({
      type: "TRACK",
      tabId,
      job: draft,
    });
    if (result.ok) {
      form.replaceWith(trackedNotice(result.applicationId, result.outcome));
      message.remove();
    } else {
      button.disabled = false;
      button.textContent = "Track application";
      message.className = result.queued ? "notice warning" : "error";
      message.textContent = result.error;
    }
  };

  app.replaceChildren(
    ...present(
      h("p", { className: "muted" }, `Connected to ${account}.`),
      state.tracked
        ? trackedNotice(state.tracked.applicationId, state.tracked.outcome)
        : form,
      message,
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id ?? null;
  const pageJob = tabId === null ? null : await readPage(tabId);
  const state = await send<PopupState>({
    type: "GET_POPUP_STATE",
    tabId: tabId ?? -1,
    pageJob,
  });

  status.hidden = false;
  status.dataset.connected = String(state.connected);
  status.textContent = state.connected ? "Connected" : "Not connected";
  if (state.connected) renderConnected(state, tabId);
  else renderDisconnected(state);
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
