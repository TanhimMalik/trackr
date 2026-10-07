import type {
  ApplicationEventType,
  ApplicationSource,
  ApplicationStatus,
  ContactType,
  EmploymentType,
  EventSourceType,
  InterviewStatus,
  InterviewType,
  SourcePlatform,
} from "./enums";

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  RECRUITER_SCREEN: "Recruiter screen",
  INTERVIEW: "Interview",
  FINAL_ROUND: "Final round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "Unknown",
};

/** Timeline wording for each event type. */
export const APPLICATION_EVENT_LABELS: Record<ApplicationEventType, string> = {
  JOB_SAVED: "Saved",
  APPLICATION_SUBMITTED: "Applied",
  APPLICATION_CONFIRMATION_RECEIVED: "Application confirmation received",
  ASSESSMENT_RECEIVED: "Assessment received",
  RECRUITER_CONTACT: "Recruiter contacted you",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_RESCHEDULED: "Interview rescheduled",
  NEXT_ROUND: "Moved to the next round",
  OFFER_RECEIVED: "Offer received",
  REJECTION_RECEIVED: "Rejection received",
  APPLICATION_WITHDRAWN: "Application withdrawn",
  FOLLOW_UP_SENT: "Follow-up sent",
  STATUS_OVERRIDDEN: "Status changed",
};

export const EVENT_SOURCE_LABELS: Record<EventSourceType, string> = {
  BROWSER_EXTENSION: "Extension",
  EMAIL: "Gmail",
  MANUAL: "Manual",
  SYSTEM: "System",
};

export const SOURCE_PLATFORM_LABELS: Record<SourcePlatform, string> = {
  LINKEDIN: "LinkedIn",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  WORKDAY: "Workday",
  ICIMS: "iCIMS",
  COMPANY_SITE: "Company site",
  INDEED: "Indeed",
  OTHER: "Other",
};

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSource, string> = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  COMPANY_SITE: "Company website",
  REFERRAL: "Referral",
  HANDSHAKE: "Handshake",
  OTHER: "Other",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  TEMPORARY: "Temporary",
  OTHER: "Other",
};

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  RECRUITER_SCREEN: "Recruiter screen",
  TECHNICAL: "Technical interview",
  HIRING_MANAGER: "Hiring manager interview",
  ONSITE: "Onsite interview",
  FINAL: "Final interview",
  OTHER: "Interview",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  INTERVIEWER: "Interviewer",
  COORDINATOR: "Coordinator",
  OTHER: "Other",
};
