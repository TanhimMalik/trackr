import type { FitLabel, TriageStatus } from "@trackr/domain";
import {
  isChoosable,
  keptByDefault,
  ordered,
  toClose,
  toSave,
  type TriageItem,
  type TriageRun,
} from "../shared/triage";
import type { TriageOutcome } from "../shared/types";
import { h, openTab, present, send } from "./dom";

/** Every http(s) site: what reading open tabs needs, asked for on first use. */
export const READ_TABS = { origins: ["https://*/*", "http://*/*"] };

const LABELS: Record<FitLabel, string> = {
  STRONG: "Strong",
  POSSIBLE: "Possible",
  STRETCH: "Stretch",
};

const UNSCORED: Record<Exclude<TriageStatus, "SCORED">, string> = {
  NO_DESCRIPTION: "Not enough of the posting on the page to score",
  LIMIT: "Today's scoring limit is used up",
  UNAVAILABLE: "Claude didn't answer. Run it again later.",
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function row(item: TriageItem, kept: Set<string>, onToggle: () => void) {
  const choosable = isChoosable(item);
  const checkbox = h("input", {
    type: "checkbox",
    checked: kept.has(item.key),
    disabled: !choosable,
    onchange: () => {
      if (checkbox.checked) kept.add(item.key);
      else kept.delete(item.key);
      onToggle();
    },
  });
  checkbox.setAttribute(
    "aria-label",
    `Keep ${item.job.companyName}, ${item.job.jobTitle}`,
  );
  const detail = item.fit
    ? item.fit.summary ||
      (item.fit.gaps[0] ? `Missing: ${item.fit.gaps[0]}` : "")
    : item.status === "SCORED"
      ? ""
      : UNSCORED[item.status];

  return h(
    "li",
    { className: `triage-row${item.closed ? " closed" : ""}` },
    choosable ? checkbox : h("span", { className: "triage-spacer" }),
    h(
      "div",
      { className: "triage-text" },
      h(
        "p",
        { className: "triage-title" },
        h("strong", {}, item.job.companyName),
        ` · ${item.job.jobTitle}`,
      ),
      detail && h("p", { className: "muted triage-detail" }, detail),
    ),
    item.saved
      ? h("span", { className: "tag success" }, "Saved")
      : item.applicationId
        ? h(
            "button",
            {
              type: "button",
              className: "tag link",
              onclick: openTab(`/applications/${item.applicationId}`),
            },
            "In Trackr",
          )
        : item.closed
          ? h("span", { className: "tag" }, "Closed")
          : item.fit &&
            h(
              "span",
              { className: `tag fit ${item.fit.label.toLowerCase()}` },
              `${LABELS[item.fit.label]} ${item.fit.score}`,
            ),
  );
}

/**
 * The triage of a window's tabs: best fits first, strong fits kept, the
 * rest offered for closing. Saving and closing are the person's call.
 */
export function renderTriage(
  container: HTMLElement,
  run: TriageRun,
  { back, again }: { back: () => void; again: () => void },
) {
  const kept = keptByDefault(run.items);
  const message = h("p", { className: "muted", role: "status" });
  const list = h("ul", { className: "triage-list" });
  const save = h("button", { type: "button" });
  const close = h("button", { type: "button", className: "secondary" });
  let confirming = false;

  const draw = () => {
    list.replaceChildren(
      ...ordered(run.items).map((item) => row(item, kept, draw)),
    );
    const saving = toSave(run.items, kept).length;
    const closing = toClose(run.items, kept).length;
    save.textContent = saving > 0 ? `Save ${saving} to Trackr` : "Save";
    save.disabled = saving === 0;
    close.textContent = confirming
      ? `Close ${plural(closing, "tab")}?`
      : closing > 0
        ? `Close ${closing} other${closing === 1 ? "" : "s"}`
        : "Close";
    close.disabled = closing === 0;
  };

  const apply = async (outcome: Promise<TriageOutcome>, done: string) => {
    save.disabled = close.disabled = true;
    const result = await outcome;
    if (result.run) run.items = result.run.items;
    message.className = result.ok ? "notice success" : "error";
    message.textContent = result.ok ? done : result.error;
    draw();
  };

  save.onclick = () => {
    const keys = toSave(run.items, kept).map((item) => item.key);
    save.textContent = "Saving…";
    void apply(
      send({ type: "TRIAGE_SAVE", windowId: run.windowId, keys }),
      `Saved ${plural(keys.length, "job")} to Trackr, ready for when you apply.`,
    );
  };
  close.onclick = () => {
    // Closing tabs can't be undone from here, so it takes a second click.
    if (!confirming) {
      confirming = true;
      draw();
      return;
    }
    confirming = false;
    const keys = toClose(run.items, kept).map((item) => item.key);
    void apply(
      send({ type: "TRIAGE_CLOSE", windowId: run.windowId, keys }),
      `Closed ${plural(keys.length, "posting")}. Chrome's History can reopen them.`,
    );
  };

  const scored = run.items.filter((item) => item.fit);
  const strong = scored.filter((item) => item.fit!.label === "STRONG").length;
  const notes = [
    run.unreadable > 0 &&
      `${plural(run.unreadable, "tab")} ${run.unreadable === 1 ? "wasn't a job post" : "weren't job posts"} Trackr can read.`,
    run.skipped > 0 && `${run.skipped} more postings weren't checked.`,
  ].filter(Boolean) as string[];

  draw();
  document.body.classList.add("wide");
  container.replaceChildren(
    ...present(
      h(
        "div",
        { className: "triage-head" },
        h(
          "button",
          { type: "button", className: "link", onclick: back },
          "← Back",
        ),
        h(
          "button",
          { type: "button", className: "link", onclick: again },
          "Run again",
        ),
      ),
      h(
        "p",
        {},
        run.items.length === 0
          ? "No job posts Trackr can read are open in this window."
          : `${plural(run.items.length, "job post")}, ${strong} strong ${strong === 1 ? "fit" : "fits"}. Strong fits are kept; untick any you'd rather close.`,
      ),
      notes.length > 0 && h("p", { className: "muted" }, notes.join(" ")),
      run.items.length > 0 && list,
      run.items.length > 0 && h("div", { className: "actions" }, save, close),
      message,
      h(
        "div",
        { className: "footer" },
        h(
          "button",
          {
            type: "button",
            className: "link",
            onclick: openTab("/applications?status=SAVED&sort=fit"),
          },
          "Saved jobs ↗",
        ),
        h(
          "button",
          {
            type: "button",
            className: "link quiet",
            onclick: async () => {
              await chrome.permissions.remove(READ_TABS);
              back();
            },
          },
          "Stop reading tabs",
        ),
      ),
    ),
  );
}

/** Asks to read tabs if it can't yet, then triages the window. */
export async function startTriage(
  container: HTMLElement,
  windowId: number,
  back: () => void,
) {
  // The prompt needs the click that started this, so it comes first.
  const granted = await chrome.permissions.request(READ_TABS);
  if (!granted) {
    container.replaceChildren(
      h(
        "p",
        { className: "error" },
        "Triage needs permission to read the job posts open in your tabs.",
      ),
      h(
        "button",
        { type: "button", className: "link", onclick: back },
        "← Back",
      ),
    );
    return;
  }
  container.replaceChildren(
    h(
      "p",
      { className: "muted" },
      "Reading your tabs and scoring the job posts…",
    ),
  );
  const again = () => void startTriage(container, windowId, back);
  const outcome = await send<TriageOutcome>({ type: "TRIAGE", windowId });
  if (outcome.ok) {
    renderTriage(container, outcome.run, { back, again });
    return;
  }
  container.replaceChildren(
    ...present(
      h("p", { className: "error" }, outcome.error),
      Boolean(outcome.needsResume) &&
        h(
          "button",
          { type: "button", className: "link", onclick: openTab("/settings") },
          "Add your resume ↗",
        ),
      h(
        "button",
        { type: "button", className: "link", onclick: back },
        "← Back",
      ),
    ),
  );
}
