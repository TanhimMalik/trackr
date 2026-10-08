import { detectorFor } from "../detectors";
import type { Message } from "../shared/types";

// Runs on supported job boards only (see the manifest). Reads the job on the
// page and watches for the application going through. Nothing leaves the
// browser until it does.

const detector = detectorFor(new URL(location.href));

function send(message: Message) {
  try {
    void chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // The extension was updated or removed while the page was open.
  }
}

if (detector) {
  let lastJob = "";
  let sawForm = false;
  let reported = false;

  const scan = () => {
    const url = new URL(location.href);
    const job = detector.extractJob(document, url);
    if (job) {
      const key = JSON.stringify(job);
      if (key !== lastJob) {
        lastJob = key;
        send({
          type: "JOB_CONTEXT",
          job: { ...job, capturedAt: new Date().toISOString() },
        });
      }
    }

    if (detector.hasApplicationForm(document)) sawForm = true;
    const confirmation = detector.confirmation(document, url);
    if (
      !reported &&
      (confirmation === "url" || (confirmation === "state" && sawForm))
    ) {
      reported = true;
      send({ type: "APPLICATION_SUBMITTED" });
      observer.disconnect();
    }
  };

  // Job boards render and navigate client-side; rescan as the page changes.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(scan, 300);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scan();
}
