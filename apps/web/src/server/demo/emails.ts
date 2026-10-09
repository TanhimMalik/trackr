import {
  CLASSIFICATION_EVENTS,
  type ApplicationEventType,
  type EmailClassification,
  type SourcePlatform,
} from "@trackr/domain";

/**
 * The demo's simulated inbox: fictional emails a visitor can "receive",
 * processed by the same pipeline as Gmail sync (relevance, rules, matching,
 * routing). Each one shows a different outcome against the demo data.
 */
export type DemoEmail = {
  id:
    | "interview"
    | "assessment"
    | "rejection"
    | "confirmation"
    | "recruiter"
    | "newsletter";
  /** What the visitor sees in the inbox list. */
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  links?: string[];
  /** Gmail label ids; a newsletter would be under Promotions. */
  labels?: string[];
  hasListUnsubscribe?: boolean;
  /** What should happen, shown before the visitor tries it. */
  expect: string;
};

export const DEMO_EMAILS: readonly DemoEmail[] = [
  {
    id: "interview",
    fromName: "Plaid Recruiting",
    fromEmail: "no-reply@hire.lever.co",
    subject: "Next steps for your Plaid application",
    body: [
      "Hi there,",
      "Thanks for applying to the Backend Engineer role at Plaid. We enjoyed reading your application and would like to invite you to a 45-minute technical interview with one of our engineers.",
      "Please use the link below to pick a time that works for you this week.",
      "Best,",
      "Plaid Recruiting",
    ].join("\n\n"),
    links: ["https://jobs.lever.co/plaid/schedule"],
    expect: "Moves Plaid to Interviewing",
  },
  {
    id: "assessment",
    fromName: "Linear Hiring",
    fromEmail: "no-reply@ashbyhq.com",
    subject: "Linear: your take-home assignment",
    body: [
      "Hi,",
      "Thank you for your interest in the Software Engineer position at Linear. As the next step, we'd like you to complete a take-home assignment. You'll have 5 days to submit it once you open the link.",
      "Good luck!",
      "The Linear team",
    ].join("\n\n"),
    links: ["https://jobs.ashbyhq.com/linear/assessment"],
    expect: "Moves Linear to Assessment",
  },
  {
    id: "rejection",
    fromName: "Coinbase",
    fromEmail: "no-reply@us.greenhouse-mail.io",
    subject: "Update on your application to Coinbase",
    body: [
      "Hi,",
      "Thank you for your interest in the Software Engineer II role at Coinbase and for the time you put into applying.",
      "After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our needs at this time.",
      "We wish you the best in your search.",
      "Coinbase Recruiting",
    ].join("\n\n"),
    expect: "Marks Coinbase as Rejected",
  },
  {
    id: "confirmation",
    fromName: "Mercury",
    fromEmail: "no-reply@ashbyhq.com",
    subject: "Thanks for applying to Mercury",
    body: [
      "Hi,",
      "Thank you for applying to the Full Stack Engineer role at Mercury! We have received your application and our team will review it shortly.",
      "If your background is a fit, someone from our team will reach out about next steps.",
      "Mercury Recruiting",
    ].join("\n\n"),
    links: ["https://jobs.ashbyhq.com/mercury"],
    expect: "Adds Mercury, which you weren't tracking",
  },
  {
    id: "recruiter",
    fromName: "Jordan Avery",
    fromEmail: "jordan.avery@brex.example",
    subject: "Engineering roles at Brex",
    body: [
      "Hi,",
      "I'm a recruiter at Brex and came across your profile. We're hiring software engineers for our payments team and I think your background could be a great fit.",
      "Would you be open to a quick call next week to chat about the role?",
      "Thanks,",
      "Jordan",
    ].join("\n\n"),
    expect: "Asks you, since you haven't applied there",
  },
  {
    id: "newsletter",
    fromName: "The Weekly Byte",
    fromEmail: "newsletter@weeklybyte.example",
    subject: "This week: 10 tips for a faster test suite",
    body: "Our favorite reads of the week, plus a new episode of the podcast. Unsubscribe at any time.",
    labels: ["CATEGORY_PROMOTIONS"],
    hasListUnsubscribe: true,
    expect: "Ignored: not about a job",
  },
];

type SeedEmail = { subject: string; evidence: string };

const SEED_EMAILS: Partial<
  Record<ApplicationEventType, (company: string, title: string) => SeedEmail>
> = {
  APPLICATION_CONFIRMATION_RECEIVED: (company, title) => ({
    subject: `Thank you for applying to ${company}`,
    evidence: `We have received your application for the ${title} role and our team will review it shortly.`,
  }),
  ASSESSMENT_RECEIVED: (company) => ({
    subject: `${company} coding assessment`,
    evidence:
      "As the next step, we'd like you to complete an online coding assessment within the next 7 days.",
  }),
  RECRUITER_CONTACT: (company, title) => ({
    subject: `Hello from ${company}`,
    evidence: `I'm a recruiter at ${company} and would love to tell you more about the ${title} role.`,
  }),
  INTERVIEW_REQUESTED: (company, title) => ({
    subject: `Interview with ${company}`,
    evidence: `We'd like to invite you to interview for the ${title} role. Please share a few times that work for you.`,
  }),
  INTERVIEW_SCHEDULED: (company) => ({
    subject: `Confirmed: your ${company} interview`,
    evidence:
      "Your interview is confirmed. You'll receive a calendar invitation with the video link shortly.",
  }),
  INTERVIEW_RESCHEDULED: (company) => ({
    subject: `Updated time for your ${company} interview`,
    evidence: "Your interview has been moved to a new time.",
  }),
  NEXT_ROUND: (company) => ({
    subject: `Next steps with ${company}`,
    evidence:
      "We're happy to let you know we'd like to move you forward to the next round of interviews.",
  }),
  OFFER_RECEIVED: (company, title) => ({
    subject: `Your offer from ${company}`,
    evidence: `We're thrilled to extend you an offer for the ${title} position.`,
  }),
  REJECTION_RECEIVED: (company) => ({
    subject: `Your application to ${company}`,
    evidence:
      "After careful consideration, we have decided to move forward with other candidates.",
  }),
};

const PLATFORM_SENDERS: Partial<Record<SourcePlatform, string>> = {
  GREENHOUSE: "no-reply@us.greenhouse-mail.io",
  LEVER: "no-reply@hire.lever.co",
  ASHBY: "no-reply@ashbyhq.com",
};

const EVENT_CLASSIFICATIONS = new Map(
  Object.entries(CLASSIFICATION_EVENTS).map(([classification, event]) => [
    event,
    classification as EmailClassification,
  ]),
);

/**
 * The email behind a seeded demo event, as Gmail sync would have stored it:
 * sender, subject, snippet and the sentence it was classified on.
 */
export function seedEmailFor(
  type: ApplicationEventType,
  {
    companyName,
    jobTitle,
    platform,
  }: { companyName: string; jobTitle: string; platform: SourcePlatform | null },
) {
  const template = SEED_EMAILS[type]?.(companyName, jobTitle) ?? {
    subject: `An update from ${companyName}`,
    evidence: `An update about your ${jobTitle} application.`,
  };
  return {
    senderName: `${companyName} Recruiting`,
    senderEmail: (platform && PLATFORM_SENDERS[platform]) ?? null,
    subject: template.subject,
    snippet: `Hi, thanks for your interest in ${companyName}. ${template.evidence}`,
    classification: EVENT_CLASSIFICATIONS.get(type) ?? null,
    evidence: template.evidence,
  };
}
