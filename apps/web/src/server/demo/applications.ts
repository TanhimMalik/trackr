import {
  domainFromWebsite,
  type ApplicationEventType,
  type ClassificationMethod,
} from "@trackr/domain";
import type { CreateApplicationInput } from "@/lib/applications/input";

/** An event in a demo application's history, timed relative to the seed date. */
export type DemoEvent = {
  type: ApplicationEventType;
  /** Days before the seed date. Always at least 1, so every event is in the past. */
  day: number;
  /** Time of day in UTC. */
  hour?: number;
  minute?: number;
  via: "extension" | "email" | "manual";
  method?: ClassificationMethod;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type DemoApplication = Omit<
  CreateApplicationInput,
  "status" | "appliedAt"
> & { events: DemoEvent[] };

/** Captured by the extension on submission, then confirmed by email minutes later. */
const capturedAndConfirmed = (day: number, hour = 14): DemoEvent[] => [
  { type: "APPLICATION_SUBMITTED", day, hour, via: "extension" },
  {
    type: "APPLICATION_CONFIRMATION_RECEIVED",
    day,
    hour,
    minute: 4,
    via: "email",
    confidence: 0.99,
  },
];

const email = (
  type: ApplicationEventType,
  day: number,
  details: Partial<DemoEvent> = {},
): DemoEvent => ({
  type,
  day,
  hour: 16,
  via: "email",
  confidence: 0.97,
  ...details,
});

const usd = (min: number, max: number) => ({
  salaryMin: min,
  salaryMax: max,
  salaryCurrency: "USD",
});

/**
 * A realistic job search: about 20 applications across every stage, captured
 * from the extension, Gmail and manual entry. Company names are real; the
 * histories are fictional.
 */
export const DEMO_APPLICATIONS: DemoApplication[] = [
  {
    companyName: "Stripe",
    companyWebsite: "stripe.com",
    jobTitle: "Software Engineer, New Grad",
    jobUrl: "https://stripe.com/jobs",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    ...usd(150_000, 185_000),
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(46),
      email("RECRUITER_CONTACT", 39, { method: "LLM", confidence: 0.86 }),
      email("INTERVIEW_REQUESTED", 35, { confidence: 0.96 }),
      email("INTERVIEW_SCHEDULED", 33, {
        metadata: { interviewKind: "TECHNICAL" },
      }),
      email("NEXT_ROUND", 21, {
        confidence: 0.93,
        metadata: { isFinalRound: true },
      }),
      email("OFFER_RECEIVED", 6, { confidence: 0.98 }),
    ],
  },
  {
    companyName: "Ramp",
    companyWebsite: "ramp.com",
    jobTitle: "Software Engineer, Backend",
    jobUrl: "https://ramp.com/careers",
    location: "New York, NY",
    employmentType: "FULL_TIME",
    ...usd(160_000, 200_000),
    source: "REFERRAL",
    sourcePlatform: "ASHBY",
    notes: "Referred by a former teammate on the payments team.",
    events: [
      ...capturedAndConfirmed(27),
      email("RECRUITER_CONTACT", 20, { method: "LLM", confidence: 0.88 }),
      email("INTERVIEW_REQUESTED", 13),
      email("INTERVIEW_SCHEDULED", 11, {
        metadata: { interviewKind: "TECHNICAL" },
      }),
    ],
  },
  {
    companyName: "Vercel",
    companyWebsite: "vercel.com",
    jobTitle: "Frontend Engineer",
    jobUrl: "https://vercel.com/careers",
    location: "Remote (US)",
    employmentType: "FULL_TIME",
    source: "COMPANY_SITE",
    sourcePlatform: "ASHBY",
    events: [
      ...capturedAndConfirmed(29, 15),
      email("INTERVIEW_REQUESTED", 16, { confidence: 0.95 }),
    ],
  },
  {
    companyName: "Duolingo",
    companyWebsite: "duolingo.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://careers.duolingo.com",
    location: "Pittsburgh, PA",
    employmentType: "FULL_TIME",
    ...usd(140_000, 170_000),
    source: "COMPANY_SITE",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(31),
      email("ASSESSMENT_RECEIVED", 26),
      email("INTERVIEW_REQUESTED", 19),
      email("NEXT_ROUND", 9, {
        confidence: 0.91,
        metadata: { isFinalRound: true },
      }),
    ],
  },
  {
    companyName: "Asana",
    companyWebsite: "asana.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://asana.com/jobs",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "REFERRAL",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(25, 13),
      email("RECRUITER_CONTACT", 17, { method: "LLM", confidence: 0.84 }),
    ],
  },
  {
    companyName: "Datadog",
    companyWebsite: "datadoghq.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://careers.datadoghq.com",
    location: "New York, NY",
    employmentType: "FULL_TIME",
    ...usd(145_000, 180_000),
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(24),
      email("ASSESSMENT_RECEIVED", 19, { confidence: 0.98 }),
    ],
  },
  {
    companyName: "Figma",
    companyWebsite: "figma.com",
    jobTitle: "Frontend Engineer",
    jobUrl: "https://www.figma.com/careers",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "COMPANY_SITE",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(21, 17),
      email("ASSESSMENT_RECEIVED", 15, { confidence: 0.96 }),
    ],
  },
  {
    companyName: "Dropbox",
    companyWebsite: "dropbox.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://jobs.dropbox.com",
    location: "Remote (US)",
    employmentType: "FULL_TIME",
    source: "INDEED",
    sourcePlatform: "GREENHOUSE",
    events: [...capturedAndConfirmed(30, 18), email("ASSESSMENT_RECEIVED", 23)],
  },
  {
    companyName: "Notion",
    companyWebsite: "notion.com",
    jobTitle: "Product Engineer",
    jobUrl: "https://www.notion.com/careers",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "ASHBY",
    // Applied without the extension; Gmail found the confirmation.
    events: [
      email("APPLICATION_CONFIRMATION_RECEIVED", 18, { confidence: 0.99 }),
    ],
  },
  {
    companyName: "Plaid",
    companyWebsite: "plaid.com",
    jobTitle: "Backend Engineer",
    jobUrl: "https://plaid.com/careers",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "LEVER",
    events: [
      { type: "APPLICATION_SUBMITTED", day: 20, hour: 15, via: "extension" },
    ],
  },
  {
    companyName: "Linear",
    companyWebsite: "linear.app",
    jobTitle: "Software Engineer",
    jobUrl: "https://linear.app/careers",
    location: "Remote",
    employmentType: "FULL_TIME",
    source: "COMPANY_SITE",
    sourcePlatform: "ASHBY",
    events: [
      { type: "APPLICATION_SUBMITTED", day: 9, hour: 19, via: "manual" },
    ],
  },
  {
    companyName: "Coinbase",
    companyWebsite: "coinbase.com",
    jobTitle: "Software Engineer II",
    jobUrl: "https://www.coinbase.com/careers",
    location: "Remote (US)",
    employmentType: "FULL_TIME",
    ...usd(155_000, 190_000),
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(17, 16),
      { type: "FOLLOW_UP_SENT", day: 3, hour: 15, via: "manual" },
    ],
  },
  {
    companyName: "Shopify",
    companyWebsite: "shopify.com",
    jobTitle: "Developer",
    jobUrl: "https://www.shopify.com/careers",
    location: "Remote (Canada)",
    employmentType: "FULL_TIME",
    salaryMin: 120_000,
    salaryMax: 150_000,
    salaryCurrency: "CAD",
    source: "HANDSHAKE",
    sourcePlatform: "COMPANY_SITE",
    events: [
      email("APPLICATION_CONFIRMATION_RECEIVED", 6, {
        hour: 13,
        confidence: 0.98,
      }),
    ],
  },
  {
    companyName: "Discord",
    companyWebsite: "discord.com",
    jobTitle: "Software Engineer, Infrastructure",
    jobUrl: "https://discord.com/careers",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: capturedAndConfirmed(2, 15),
  },
  {
    companyName: "Cloudflare",
    companyWebsite: "cloudflare.com",
    jobTitle: "Systems Engineer",
    jobUrl: "https://www.cloudflare.com/careers",
    location: "Austin, TX",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(36),
      email("REJECTION_RECEIVED", 22, { confidence: 0.98 }),
    ],
  },
  {
    companyName: "Airbnb",
    companyWebsite: "airbnb.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://careers.airbnb.com",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(41),
      email("INTERVIEW_REQUESTED", 32),
      email("INTERVIEW_SCHEDULED", 30, {
        metadata: { interviewKind: "TECHNICAL" },
      }),
      email("REJECTION_RECEIVED", 19),
    ],
  },
  {
    companyName: "Robinhood",
    companyWebsite: "robinhood.com",
    jobTitle: "Software Engineer, Backend",
    jobUrl: "https://careers.robinhood.com",
    location: "Menlo Park, CA",
    employmentType: "FULL_TIME",
    source: "INDEED",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(33, 17),
      email("REJECTION_RECEIVED", 28, { confidence: 0.99 }),
    ],
  },
  {
    companyName: "Databricks",
    companyWebsite: "databricks.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://www.databricks.com/company/careers",
    location: "San Francisco, CA",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "GREENHOUSE",
    events: [
      ...capturedAndConfirmed(38),
      email("ASSESSMENT_RECEIVED", 31),
      email("REJECTION_RECEIVED", 23, { confidence: 0.96 }),
    ],
  },
  {
    companyName: "GitHub",
    companyWebsite: "github.com",
    jobTitle: "Software Engineer",
    jobUrl: "https://github.careers",
    location: "Remote (US)",
    employmentType: "FULL_TIME",
    source: "LINKEDIN",
    sourcePlatform: "COMPANY_SITE",
    notes: "Withdrew after the role moved to a different team.",
    events: [
      { type: "APPLICATION_SUBMITTED", day: 34, hour: 18, via: "manual" },
      email("APPLICATION_CONFIRMATION_RECEIVED", 34, {
        hour: 18,
        minute: 6,
        confidence: 0.99,
      }),
      { type: "APPLICATION_WITHDRAWN", day: 14, hour: 20, via: "manual" },
    ],
  },
  {
    companyName: "Snowflake",
    companyWebsite: "snowflake.com",
    jobTitle: "Software Engineer Intern",
    jobUrl: "https://careers.snowflake.com",
    location: "San Mateo, CA",
    employmentType: "INTERNSHIP",
    source: "HANDSHAKE",
    sourcePlatform: "OTHER",
    events: [{ type: "JOB_SAVED", day: 2, hour: 21, via: "manual" }],
  },
];

/** The demo companies' domains, whose logos are public (the landing page shows them). */
export const DEMO_COMPANY_DOMAINS: ReadonlySet<string> = new Set(
  DEMO_APPLICATIONS.flatMap(({ companyWebsite }) => {
    const domain = companyWebsite ? domainFromWebsite(companyWebsite) : null;
    return domain ? [domain] : [];
  }),
);
