import type { EmailClassification } from "../enums";
import type { EmailContent } from "./types";

/**
 * A labeled corpus of job-search email, written to match the shape of real
 * messages from applicant tracking systems, recruiters and job boards.
 * Companies and people are fictional. Used by the tests and the quality report.
 */
export type EmailFixture = {
  id: string;
  email: EmailContent;
  expected: {
    relevant: boolean;
    classification?: EmailClassification;
    /** Inclusive bounds for the classifier's confidence. */
    confidence?: [number, number];
    companyName?: string | null;
    jobTitle?: string | null;
    atsJobId?: string | null;
  };
};

const email = (
  fields: Partial<EmailContent> &
    Pick<EmailContent, "fromEmail" | "subject" | "body">,
): EmailContent => ({
  fromName: null,
  snippet: fields.body.slice(0, 160),
  labels: ["INBOX", "CATEGORY_UPDATES"],
  hasListUnsubscribe: false,
  links: [],
  calendarStart: null,
  ...fields,
});

export const EMAIL_FIXTURES: EmailFixture[] = [
  // Application confirmations
  {
    id: "greenhouse-confirmation",
    email: email({
      fromName: "Northwind Labs Hiring Team",
      fromEmail: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for applying to Northwind Labs",
      body: "Hi Sam,\n\nThanks for applying to the Platform Engineer position at Northwind Labs. We've received your application and our team will review it shortly. If your experience is a match, a recruiter will reach out to schedule an interview.\n\nWe offer competitive benefits and a remote-first culture.\n\nNorthwind Labs Recruiting",
      links: ["https://job-boards.greenhouse.io/northwindlabs/jobs/4012345"],
    }),
    expected: {
      relevant: true,
      classification: "APPLICATION_CONFIRMATION",
      confidence: [0.97, 0.97],
      companyName: "Northwind Labs",
      jobTitle: "Platform Engineer",
      atsJobId: "4012345",
    },
  },
  {
    id: "lever-confirmation",
    email: email({
      fromName: "Fabrikam",
      fromEmail: "no-reply@hire.lever.co",
      subject: "Fabrikam: your application has been received",
      body: "Thank you for your application for the Backend Engineer, Payments role at Fabrikam. Your application has been submitted successfully. View the posting: https://jobs.lever.co/fabrikam/2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
    }),
    expected: {
      relevant: true,
      classification: "APPLICATION_CONFIRMATION",
      companyName: "Fabrikam",
      jobTitle: "Backend Engineer, Payments",
      atsJobId: "2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
    },
  },
  {
    id: "ashby-confirmation",
    email: email({
      fromName: "Tailspin",
      fromEmail: "no-reply@ashbyhq.com",
      subject: "Thanks for applying to Tailspin!",
      body: "Hi Sam, thanks for applying for the Product Designer role at Tailspin. We'll be in touch soon.",
    }),
    expected: {
      relevant: true,
      classification: "APPLICATION_CONFIRMATION",
      companyName: "Tailspin",
      jobTitle: "Product Designer",
    },
  },
  {
    id: "workday-confirmation",
    email: email({
      fromName: "Contoso Careers",
      fromEmail: "contoso@myworkday.com",
      subject: "Application received: Data Analyst",
      body: "Dear Sam, we have received your application for the Data Analyst position. You can track the status of your application in our candidate home.",
    }),
    expected: {
      relevant: true,
      classification: "APPLICATION_CONFIRMATION",
      companyName: "Contoso",
      jobTitle: "Data Analyst",
    },
  },
  {
    id: "company-confirmation",
    email: email({
      fromName: "Globex Careers",
      fromEmail: "careers@globex.example",
      subject: "We received your application",
      body: "Thank you for your interest in Globex. We have received your application for the Site Reliability Engineer role and will review it carefully.",
    }),
    expected: {
      relevant: true,
      classification: "APPLICATION_CONFIRMATION",
      // Not from an ATS, so short of automatic.
      confidence: [0.93, 0.93],
      companyName: "Globex",
      jobTitle: "Site Reliability Engineer",
    },
  },
  {
    id: "linkedin-easy-apply",
    email: email({
      fromName: "LinkedIn",
      fromEmail: "jobs-noreply@linkedin.com",
      subject: "Your application was sent to Initech",
      body: "Your application was sent to Initech. Software Engineer II, Initech, Austin, TX. Applied on LinkedIn.",
      labels: ["INBOX", "CATEGORY_UPDATES"],
    }),
    expected: { relevant: true, classification: "APPLICATION_CONFIRMATION" },
  },

  // Rejections
  {
    id: "rejection-standard",
    email: email({
      fromName: "Northwind Labs Hiring Team",
      fromEmail: "no-reply@us.greenhouse-mail.io",
      subject: "Your application to Northwind Labs",
      body: "Hi Sam,\n\nThank you for your interest in the Platform Engineer position. Unfortunately, we have decided to move forward with other candidates whose experience more closely matches our needs. We wish you the best in your search.",
    }),
    expected: {
      relevant: true,
      classification: "REJECTION",
      confidence: [0.97, 0.97],
      companyName: "Northwind Labs",
    },
  },
  {
    id: "rejection-warm",
    email: email({
      fromName: "Priya Raman",
      fromEmail: "priya@fabrikam.example",
      subject: "Following up on your interviews",
      body: "Hi Sam, thank you so much for the time you spent with the team last week. We really enjoyed speaking with you. After careful consideration, we will not be moving forward with your candidacy for the Backend Engineer role. I'd love to stay in touch.",
    }),
    expected: { relevant: true, classification: "REJECTION" },
  },
  {
    id: "rejection-filled",
    email: email({
      fromName: "Tailspin Recruiting",
      fromEmail: "recruiting@tailspin.example",
      subject: "Update on your application",
      body: "Hello, we wanted to let you know that the position has been filled. Thank you for applying.",
    }),
    expected: { relevant: true, classification: "REJECTION" },
  },
  {
    id: "rejection-regret",
    email: email({
      fromName: "Contoso Careers",
      fromEmail: "contoso@myworkday.com",
      subject: "Regarding your application for Data Analyst",
      body: "Dear Sam, we regret to inform you that you have not been selected for the Data Analyst position.",
    }),
    expected: { relevant: true, classification: "REJECTION" },
  },

  // Assessments
  {
    id: "assessment-hackerrank",
    email: email({
      fromName: "Globex Talent",
      fromEmail: "talent@globex.example",
      subject: "Next steps: online assessment",
      body: "Hi Sam, as a next step we'd like you to complete our online assessment within 7 days. Start here: https://www.hackerrank.com/test/abc123",
      links: ["https://www.hackerrank.com/test/abc123"],
    }),
    expected: {
      relevant: true,
      classification: "ASSESSMENT",
      confidence: [0.96, 0.96],
    },
  },
  {
    id: "assessment-take-home",
    email: email({
      fromName: "Jordan Lee",
      fromEmail: "jordan@initech.example",
      subject: "Take-home exercise for the Frontend Engineer role",
      body: "Hi Sam, great chatting today! Attached is the take-home assignment. Please send it back by Friday.",
    }),
    expected: { relevant: true, classification: "ASSESSMENT" },
  },
  {
    id: "assessment-link-only",
    email: email({
      fromName: "Northwind Labs Hiring Team",
      fromEmail: "no-reply@us.greenhouse-mail.io",
      subject: "Northwind Labs - next steps for your application",
      body: "Hi Sam, please use the link below to continue.",
      links: ["https://app.codesignal.com/invite/xyz"],
      snippet: "Hi Sam, please use the link below to continue. codesignal.com",
    }),
    expected: { relevant: true, classification: "ASSESSMENT" },
  },

  // Interview requests and confirmations
  {
    id: "interview-request-availability",
    email: email({
      fromName: "Daniel Ortiz",
      fromEmail: "daniel@fabrikam.example",
      subject: "Fabrikam - Backend Engineer interview",
      body: "Hi Sam, thanks for applying! I'd like to set up a call to talk about the Backend Engineer role. Could you share your availability for next week?",
    }),
    expected: {
      relevant: true,
      classification: "INTERVIEW_REQUEST",
      confidence: [0.9, 0.9],
      companyName: "Fabrikam",
    },
  },
  {
    id: "interview-request-calendly",
    email: email({
      fromName: "Maya Chen",
      fromEmail: "maya@tailspin.example",
      subject: "Next steps with Tailspin",
      body: "Hi Sam, we loved your portfolio. Please grab a time that works for you here.",
      links: ["https://calendly.com/maya-tailspin/30min"],
    }),
    expected: { relevant: true, classification: "INTERVIEW_REQUEST" },
  },
  {
    id: "interview-request-technical",
    email: email({
      fromName: "Globex Talent",
      fromEmail: "talent@globex.example",
      subject: "Interview invitation - Site Reliability Engineer",
      body: "Hi Sam, we'd like to schedule a technical interview with two engineers from the team. Reply with a few times that work.",
    }),
    expected: { relevant: true, classification: "INTERVIEW_REQUEST" },
  },
  {
    id: "interview-confirmed-calendar",
    email: email({
      fromName: "Fabrikam Recruiting",
      fromEmail: "recruiting@fabrikam.example",
      subject: "Invitation: Fabrikam technical interview @ Thu Oct 15, 2pm",
      body: "You have been invited to the following event: Fabrikam technical interview with Priya Raman.",
      calendarStart: "2026-10-15T18:00:00.000Z",
    }),
    expected: { relevant: true, classification: "INTERVIEW_CONFIRMATION" },
  },
  {
    id: "interview-confirmed-text",
    email: email({
      fromName: "Northwind Labs Hiring Team",
      fromEmail: "no-reply@us.greenhouse-mail.io",
      subject: "Your interview with Northwind Labs is confirmed",
      body: "Hi Sam, your interview has been scheduled for Tuesday at 10am Pacific. You'll meet with the platform team.",
    }),
    expected: {
      relevant: true,
      classification: "INTERVIEW_CONFIRMATION",
      companyName: "Northwind Labs",
    },
  },
  {
    id: "interview-reschedule",
    email: email({
      fromName: "Daniel Ortiz",
      fromEmail: "daniel@fabrikam.example",
      subject: "Need to reschedule your interview",
      body: "Hi Sam, apologies, one of the interviewers is out sick. Could we reschedule your interview to Monday?",
    }),
    expected: { relevant: true, classification: "INTERVIEW_RESCHEDULE" },
  },

  // Progress
  {
    id: "next-round-final",
    email: email({
      fromName: "Maya Chen",
      fromEmail: "maya@tailspin.example",
      subject: "Great news from Tailspin",
      body: "Hi Sam, the team really enjoyed meeting you. We'd love to move you forward to the final round, a half-day with the design team.",
      // Maya is already a contact on the Tailspin application.
      knownContact: true,
    }),
    expected: { relevant: true, classification: "NEXT_ROUND" },
  },
  {
    id: "next-round-onsite",
    email: email({
      fromName: "Globex Talent",
      fromEmail: "talent@globex.example",
      subject: "Onsite interview at Globex",
      body: "Congratulations! You've been selected to advance to our onsite interview stage.",
    }),
    expected: { relevant: true, classification: "NEXT_ROUND" },
  },
  {
    id: "offer",
    email: email({
      fromName: "Priya Raman",
      fromEmail: "priya@fabrikam.example",
      subject: "Your offer from Fabrikam",
      body: "Hi Sam, I'm thrilled to share that we are pleased to extend you an offer for the Backend Engineer, Payments role. Your offer letter is attached.",
    }),
    expected: {
      relevant: true,
      classification: "OFFER",
      confidence: [0.9, 0.9],
    },
  },
  {
    id: "withdrawal",
    email: email({
      fromName: "Contoso Careers",
      fromEmail: "contoso@myworkday.com",
      subject: "Application withdrawn",
      body: "Your application has been withdrawn for the Data Analyst position at Contoso.",
    }),
    expected: { relevant: true, classification: "WITHDRAWAL" },
  },
  {
    id: "recruiter-outreach",
    email: email({
      fromName: "Alex Kim",
      fromEmail: "alex.kim@initech.example",
      subject: "Senior Software Engineer role at Initech",
      body: "Hi Sam, I came across your profile and think you'd be a strong fit for a senior engineering position on our payments team. Open to learning more?",
    }),
    expected: {
      relevant: true,
      classification: "RECRUITER_CONTACT",
      confidence: [0.7, 0.7],
    },
  },
  {
    id: "mixed-rejection-and-interview",
    email: email({
      fromName: "Jordan Lee",
      fromEmail: "jordan@initech.example",
      subject: "About your application",
      body: "Hi Sam, unfortunately the backend role has been filled and we will not be moving forward with your application for it. That said, we'd like to schedule an interview for a related position on another team.",
    }),
    expected: {
      relevant: true,
      classification: "REJECTION",
      confidence: [0.6, 0.6],
    },
  },
  {
    id: "confirmation-mentions-offer-language",
    email: email({
      fromName: "Tailspin",
      fromEmail: "no-reply@ashbyhq.com",
      subject: "Application received",
      body: "Thanks for applying! About us: we offer competitive salaries, equity, and an offer of flexible hours. Our team will review your application.",
    }),
    // "offer of flexible hours" isn't an offer of employment.
    expected: { relevant: true, classification: "APPLICATION_CONFIRMATION" },
  },

  // Not job applications
  {
    id: "linkedin-job-alert",
    email: email({
      fromName: "LinkedIn Job Alerts",
      fromEmail: "jobalerts-noreply@linkedin.com",
      subject: "30+ new jobs for Software Engineer",
      body: "Jobs you may be interested in: Software Engineer at Initech, Backend Engineer at Globex. Apply now.",
      labels: ["CATEGORY_PROMOTIONS"],
      hasListUnsubscribe: true,
    }),
    expected: { relevant: false },
  },
  {
    id: "indeed-digest",
    email: email({
      fromName: "Indeed",
      fromEmail: "alert@indeed.com",
      subject: "Job alert: Data Analyst roles near you",
      body: "Recommended for you: 12 new Data Analyst positions this week.",
      labels: ["CATEGORY_PROMOTIONS"],
      hasListUnsubscribe: true,
    }),
    expected: { relevant: false },
  },
  {
    id: "product-newsletter",
    email: email({
      fromName: "Fabrikam",
      fromEmail: "news@fabrikam.example",
      subject: "Introducing Fabrikam Pay 2.0",
      body: "Our biggest launch yet. Read the announcement and try it free for 30 days.",
      labels: ["CATEGORY_PROMOTIONS"],
      hasListUnsubscribe: true,
    }),
    expected: { relevant: false },
  },
  {
    id: "retail-offer",
    email: email({
      fromName: "Shop Co",
      fromEmail: "deals@shop.example",
      subject: "A special offer for you: 20% off",
      body: "Don't miss our weekend offer on everything in store.",
      labels: ["CATEGORY_PROMOTIONS"],
      hasListUnsubscribe: true,
    }),
    expected: { relevant: false },
  },
  {
    id: "github-role-notification",
    email: email({
      fromName: "GitHub",
      fromEmail: "notifications@github.com",
      subject: "Your role in the acme organization changed",
      body: "You are now an owner of the acme organization.",
    }),
    expected: { relevant: false },
  },
  {
    id: "personal-dinner",
    email: email({
      fromName: "Riley",
      fromEmail: "riley@gmail.com",
      subject: "Dinner on Friday?",
      body: "Hey! Are you free Friday night? Let's try that new place.",
      labels: ["INBOX", "CATEGORY_PERSONAL"],
    }),
    expected: { relevant: false },
  },
];
