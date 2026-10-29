import type { FitOutput, SourcePlatform } from "@trackr/domain";
import { SUPABASE_FIT } from "./fit";

/** A sample job posting open in a tab, with the ratings Claude would give it. */
export type DemoTabPosting = {
  companyName: string;
  jobTitle: string;
  location: string;
  url: string;
  platform: SourcePlatform;
  description: string;
  ratings: FitOutput;
};

/** A tab in the demo's pretend browser window. */
export type DemoTab = {
  id: string;
  /** What the tab strip shows. */
  title: string;
  site: string;
  /** Null for a tab that isn't a job posting. */
  posting: DemoTabPosting | null;
};

const rate = (
  rating: FitOutput["skills"]["rating"],
  evidence: string | null,
  reason: string,
  stated = true,
): FitOutput["skills"] => ({ rating, stated, evidence, reason });

// Fictional companies: the postings are made up, so no real employer's name
// is attached to them. The one exception is the demo's own saved Supabase
// job, which shows how a posting already in Trackr is left alone.
export const DEMO_TABS: DemoTab[] = [
  {
    id: "northwind",
    title: "Full-Stack Engineer, Merchant Dashboard – Northwind Pay",
    site: "jobs.lever.co",
    posting: {
      companyName: "Northwind Pay",
      jobTitle: "Full-Stack Engineer, Merchant Dashboard",
      location: "San Francisco (hybrid)",
      url: "https://jobs.lever.co/northwindpay/3f1c9a2e-8b4d-4c6a-9e21-5d7b0a1c2e34",
      platform: "LEVER",
      description: `Northwind Pay helps small businesses get paid. You'll build the dashboard merchants use to track payouts.

What you'll do
- Ship features end to end in React, TypeScript and Node.js
- Design APIs and Postgres schemas for new payment flows

What we're looking for
- 0–2 years of professional experience
- Experience with payments or financial products is a plus

Hybrid in San Francisco, three days a week. Salary: $115,000 to $135,000.`,
      ratings: {
        skills: rate(
          "FULL",
          "Ship features end to end in React, TypeScript and Node.js",
          "You've used React, TypeScript, Node.js and Postgres at work: their whole stack.",
        ),
        seniority: rate(
          "FULL",
          "0–2 years of professional experience",
          "Your year of experience is right in their range.",
        ),
        domain: rate(
          "STRONG",
          "Experience with payments or financial products is a plus",
          "Your fintech payments work is close to what they do.",
        ),
        practical: rate(
          "STRONG",
          "Salary: $115,000 to $135,000",
          "San Francisco works for you, and the pay is above your minimum.",
        ),
        gaps: [],
        summary: "A close match: their stack, their level, and payments work.",
      },
    },
  },
  {
    id: "contoso",
    title: "Software Engineer I, Developer Platform | Contoso Cloud",
    site: "job-boards.greenhouse.io",
    posting: {
      companyName: "Contoso Cloud",
      jobTitle: "Software Engineer I, Developer Platform",
      location: "Remote (US)",
      url: "https://job-boards.greenhouse.io/contosocloud/jobs/7012345",
      platform: "GREENHOUSE",
      description: `Our developer platform team builds the CLI and APIs thousands of engineers use to deploy.

Responsibilities
- Build features for our CLI and REST APIs in TypeScript and Go
- Improve the reliability of our deploy pipeline

Requirements
- 1+ years of software engineering experience
- Experience building tools for other developers is a plus

Remote (US). Salary range: $105,000 to $125,000.`,
      ratings: {
        skills: rate(
          "STRONG",
          "Build features for our CLI and REST APIs in TypeScript and Go",
          "TypeScript and REST APIs at work; Go only in a side project.",
        ),
        seniority: rate(
          "FULL",
          "1+ years of software engineering experience",
          "Your year of experience meets the bar.",
        ),
        domain: rate(
          "STRONG",
          "Experience building tools for other developers is a plus",
          "You've worked on developer tools.",
        ),
        practical: rate(
          "STRONG",
          "Salary range: $105,000 to $125,000",
          "Remote in the US, and most of the range is above your minimum.",
        ),
        gaps: ["Go in production"],
        summary: "A strong fit; Go is the one thing you haven't used at work.",
      },
    },
  },
  {
    id: "wingtip",
    title: "Backend Engineer (Node.js) - Wingtip Commerce",
    site: "jobs.ashbyhq.com",
    posting: {
      companyName: "Wingtip Commerce",
      jobTitle: "Backend Engineer (Node.js)",
      location: "Remote (US)",
      url: "https://jobs.ashbyhq.com/wingtip/8a2b4c6d-1e3f-4a5b-8c7d-9e0f1a2b3c4d",
      platform: "ASHBY",
      description: `Wingtip Commerce runs online stores for thousands of brands.

You will
- Build order and inventory services in Node.js and TypeScript
- Own services in production, including on-call

You have
- 3+ years of backend experience
- Experience with e-commerce or high-traffic systems

Remote (US). Base pay: $120,000 to $150,000.`,
      ratings: {
        skills: rate(
          "STRONG",
          "Build order and inventory services in Node.js and TypeScript",
          "You've built Node.js and TypeScript services at work.",
        ),
        seniority: rate(
          "PARTIAL",
          "3+ years of backend experience",
          "They ask for three years; you have one.",
        ),
        domain: rate(
          "PARTIAL",
          "Experience with e-commerce or high-traffic systems",
          "Payments is near e-commerce, but you haven't worked on a store.",
        ),
        practical: rate(
          "FULL",
          "Base pay: $120,000 to $150,000",
          "Remote in the US, and the pay is above your minimum.",
        ),
        gaps: ["Two more years of experience", "On-call"],
        summary: "Your stack fits, but they want more experience.",
      },
    },
  },
  {
    id: "tailspin",
    title: "Data Analyst | Tailspin Analytics Careers",
    site: "careers.tailspin.example",
    posting: {
      companyName: "Tailspin Analytics",
      jobTitle: "Data Analyst",
      location: "Austin, TX",
      url: "https://careers.tailspin.example/jobs/data-analyst",
      platform: "COMPANY_SITE",
      description: `Join our analytics team in Austin and turn data into decisions for our retail clients.

Responsibilities
- Build dashboards in Tableau and write SQL to answer business questions
- Present findings to client teams

Qualifications
- 1+ years in an analyst role
- Strong SQL; Tableau or Looker experience`,
      ratings: {
        skills: rate(
          "PARTIAL",
          "Strong SQL; Tableau or Looker experience",
          "You've written SQL at work, but haven't used Tableau or Looker.",
        ),
        seniority: rate(
          "FULL",
          "1+ years in an analyst role",
          "The level matches, though your year was in engineering.",
        ),
        domain: rate(
          "WEAK",
          "turn data into decisions for our retail clients",
          "Retail analytics is a different field from yours.",
        ),
        practical: rate(
          "WEAK",
          null,
          "Austin isn't where you'd work, and the posting doesn't give the pay.",
          false,
        ),
        gaps: ["Tableau or Looker", "Analyst experience"],
        summary: "A different job: analytics, not engineering.",
      },
    },
  },
  {
    id: "fabrikam",
    title: "Senior Software Engineer, Platform — Fabrikam Health",
    site: "fabrikamhealth.wd1.myworkdayjobs.com",
    posting: {
      companyName: "Fabrikam Health",
      jobTitle: "Senior Software Engineer, Platform",
      location: "Remote (US)",
      url: "https://fabrikamhealth.wd1.myworkdayjobs.com/careers/job/R-10234",
      platform: "WORKDAY",
      description: `Fabrikam Health's platform team keeps our clinical systems running.

What you'll do
- Run our services on Kubernetes and AWS
- Lead design reviews and mentor engineers

What you'll bring
- 5+ years of software engineering experience
- Production experience with Kubernetes
- Healthcare experience is a plus

Remote (US). Salary: $160,000 to $190,000.`,
      ratings: {
        skills: rate(
          "WEAK",
          "Production experience with Kubernetes",
          "You know Kubernetes and AWS from courses only.",
        ),
        seniority: rate(
          "WEAK",
          "5+ years of software engineering experience",
          "A senior role asking for five years; you have one.",
        ),
        domain: rate(
          "WEAK",
          "Healthcare experience is a plus",
          "You haven't worked in healthcare.",
        ),
        practical: rate(
          "FULL",
          "Salary: $160,000 to $190,000",
          "Remote in the US, and well above your minimum.",
        ),
        gaps: ["Kubernetes in production", "AWS", "Senior experience"],
        summary:
          "Good pay, but a senior platform role you'd be stretching for.",
      },
    },
  },
  {
    id: "supabase",
    title: "Software Engineer, Backend @ Supabase",
    site: "jobs.ashbyhq.com",
    posting: {
      companyName: "Supabase",
      jobTitle: "Software Engineer, Backend",
      location: "Remote (US)",
      url: "https://jobs.ashbyhq.com/supabase",
      platform: "ASHBY",
      description: SUPABASE_FIT.description,
      ratings: SUPABASE_FIT.ratings,
    },
  },
  {
    id: "article",
    title: "How to write a cover letter that gets read",
    site: "blog.example.com",
    posting: null,
  },
];
