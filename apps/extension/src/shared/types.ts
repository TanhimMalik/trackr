import type { SourcePlatform, SubmissionOutcome } from "@trackr/domain";

/** What a job page says about the job, captured before applying. */
export type JobContext = {
  platform: SourcePlatform;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  atsJobId: string | null;
  location: string | null;
  capturedAt: string;
};

/** The popup's editable fields. */
export type JobDraft = Pick<JobContext, "companyName" | "jobTitle" | "jobUrl"> &
  Partial<Pick<JobContext, "platform" | "atsJobId" | "location">>;

export type Account = {
  email: string | null;
  name: string | null;
  isDemo: boolean;
};

export type TrackResult =
  | { ok: true; applicationId: string; outcome: SubmissionOutcome }
  | { ok: false; queued: boolean; error: string };

export type PopupState = {
  connected: boolean;
  account: Account | null;
  job: JobDraft | null;
  /** Set when this tab's application was already sent to Trackr. */
  tracked: { applicationId: string; outcome: SubmissionOutcome } | null;
  pendingSubmissions: number;
};

/** Messages from the content script and the popup to the service worker. */
export type Message =
  | { type: "JOB_CONTEXT"; job: JobContext }
  | { type: "APPLICATION_SUBMITTED" }
  | { type: "GET_POPUP_STATE"; tabId: number; pageJob: JobDraft | null }
  | { type: "TRACK"; tabId: number | null; job: JobDraft }
  | { type: "CONNECT" }
  | { type: "DISCONNECT" };

/** What the Trackr connect page sends, through externally_connectable. */
export type ExternalMessage = { type: "TRACKR_CONNECT"; code: string };
