import type {
  ApplicationEventType,
  ClassificationMethod,
  EmailClassification,
} from "../enums";

/** The event each classification records. */
export const CLASSIFICATION_EVENTS: Record<
  EmailClassification,
  ApplicationEventType | null
> = {
  APPLICATION_CONFIRMATION: "APPLICATION_CONFIRMATION_RECEIVED",
  ASSESSMENT: "ASSESSMENT_RECEIVED",
  RECRUITER_CONTACT: "RECRUITER_CONTACT",
  INTERVIEW_REQUEST: "INTERVIEW_REQUESTED",
  INTERVIEW_CONFIRMATION: "INTERVIEW_SCHEDULED",
  INTERVIEW_RESCHEDULE: "INTERVIEW_RESCHEDULED",
  NEXT_ROUND: "NEXT_ROUND",
  OFFER: "OFFER_RECEIVED",
  REJECTION: "REJECTION_RECEIVED",
  WITHDRAWAL: "APPLICATION_WITHDRAWN",
  UNKNOWN: null,
};

export const AUTOMATION_DECISIONS = [
  "AUTO_APPLY",
  "APPLY_FLAGGED",
  "NEEDS_REVIEW",
  "NO_UPDATE",
] as const;
export type AutomationDecision = (typeof AUTOMATION_DECISIONS)[number];

export const CONFIDENCE_THRESHOLDS = {
  automatic: 0.95,
  flagged: 0.75,
  review: 0.5,
} as const;

export type AutomationSettings = {
  autoUpdateEnabled: boolean;
  askBeforeMediumConfidence: boolean;
};

const DEFAULT_SETTINGS: AutomationSettings = {
  autoUpdateEnabled: true,
  askBeforeMediumConfidence: false,
};

/**
 * What to do with a classified, matched email. A wrong automatic change costs
 * more trust than a confirmation prompt costs effort, so anything short of a
 * confident, clear match is asked about.
 */
export function decideAutomation(
  {
    classification,
    confidence,
    method,
    match,
  }: {
    classification: EmailClassification;
    confidence: number;
    method: ClassificationMethod;
    match: "AUTOMATIC" | "POSSIBLE" | "NONE";
  },
  settings: AutomationSettings = DEFAULT_SETTINGS,
): AutomationDecision {
  if (!CLASSIFICATION_EVENTS[classification]) return "NO_UPDATE";
  if (confidence < CONFIDENCE_THRESHOLDS.review) return "NO_UPDATE";
  if (match !== "AUTOMATIC" || confidence < CONFIDENCE_THRESHOLDS.flagged) {
    return "NEEDS_REVIEW";
  }
  // Offers and rejections inferred by the language model alone are always confirmed.
  if (
    method === "LLM" &&
    (classification === "OFFER" || classification === "REJECTION")
  ) {
    return "NEEDS_REVIEW";
  }

  const decision: AutomationDecision =
    confidence >= CONFIDENCE_THRESHOLDS.automatic
      ? "AUTO_APPLY"
      : "APPLY_FLAGGED";
  if (!settings.autoUpdateEnabled) return "NEEDS_REVIEW";
  if (decision === "APPLY_FLAGGED" && settings.askBeforeMediumConfidence) {
    return "NEEDS_REVIEW";
  }
  return decision;
}
