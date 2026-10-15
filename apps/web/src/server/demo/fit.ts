import type { FitOutput, FitPreferences, ResumeProfile } from "@trackr/domain";

/** A fictional job seeker; the demo's fit scores are judged against them. */
export const DEMO_RESUME_PROFILE: ResumeProfile = {
  headline: "Junior full-stack engineer",
  seniority: "ENTRY",
  yearsExperience: 1,
  skills: [
    {
      name: "TypeScript",
      evidence: "WORK",
      detail: "Full-stack engineer at a fintech startup",
    },
    { name: "React", evidence: "WORK", detail: "Built the customer dashboard" },
    { name: "Node.js", evidence: "WORK", detail: "Payments API services" },
    {
      name: "PostgreSQL",
      evidence: "WORK",
      detail: "Schema design and query tuning",
    },
    { name: "REST APIs", evidence: "WORK", detail: "Public payments API" },
    {
      name: "Python",
      evidence: "PROJECT",
      detail: "Data pipeline side project",
    },
    { name: "Go", evidence: "PROJECT", detail: "CLI tool on GitHub" },
    {
      name: "Docker",
      evidence: "PROJECT",
      detail: "Containerized side projects",
    },
    {
      name: "AWS",
      evidence: "COURSE",
      detail: "Cloud practitioner certificate",
    },
    { name: "Kubernetes", evidence: "COURSE", detail: "Online course" },
    { name: "Java", evidence: "COURSE", detail: "University coursework" },
  ],
  domains: ["fintech", "developer tools"],
  education: "BSc Computer Science",
};

export const DEMO_FIT_PREFERENCES: FitPreferences = {
  locations: "San Francisco, or remote in the US",
  workMode: "ANY",
  minSalary: 110_000,
};

/** A saved job's posting and the ratings Claude would give it. */
export type DemoFit = { description: string; ratings: FitOutput };

export const SUPABASE_FIT: DemoFit = {
  description: `About the role
You'll build the backend services behind our hosted Postgres platform, used by thousands of developer teams.

What you'll do
- Design and ship APIs in TypeScript and Node.js
- Work deeply with PostgreSQL: schemas, extensions and query performance
- Improve the developer experience of our dashboard, built in React

What we're looking for
- 1+ years of professional software engineering experience
- Strong TypeScript and SQL skills
- Experience building developer tools is a plus

Fully remote in the US. Salary range: $130,000 to $160,000.`,
  ratings: {
    skills: {
      rating: "FULL",
      stated: true,
      evidence: "Strong TypeScript and SQL skills",
      reason:
        "You've used TypeScript, Node.js, PostgreSQL and React at work, which covers the whole stack.",
    },
    seniority: {
      rating: "FULL",
      stated: true,
      evidence: "1+ years of professional software engineering experience",
      reason: "Your year of full-time experience meets the bar.",
    },
    domain: {
      rating: "STRONG",
      stated: true,
      evidence: "Experience building developer tools is a plus",
      reason:
        "You've worked on developer tools, though not on a database platform.",
    },
    practical: {
      rating: "FULL",
      stated: true,
      evidence: "Salary range: $130,000 to $160,000",
      reason: "Remote in the US, and the pay is above your minimum.",
    },
    gaps: ["Postgres extensions"],
    summary:
      "A close match: your work stack is their stack, at the level they ask for.",
  },
};

export const TWILIO_FIT: DemoFit = {
  description: `Software Engineer II, Billing

Our billing team builds the systems that charge and invoice hundreds of thousands of customers.

Responsibilities
- Build billing services in TypeScript and Java
- Own features end to end, from design to on-call
- Work with Kafka and AWS

Requirements
- 2+ years of experience building backend services
- Experience with TypeScript or Java
- Experience with payments or billing systems is a plus

Remote (US). The base pay range for this role is $140,000 to $175,000.`,
  ratings: {
    skills: {
      rating: "PARTIAL",
      stated: true,
      evidence: "Build billing services in TypeScript and Java",
      reason:
        "You've used TypeScript at work, but Java only in coursework, and not Kafka or AWS.",
    },
    seniority: {
      rating: "PARTIAL",
      stated: true,
      evidence: "2+ years of experience building backend services",
      reason: "They ask for two years; you have one.",
    },
    domain: {
      rating: "STRONG",
      stated: true,
      evidence: "Experience with payments or billing systems is a plus",
      reason: "Your payments API work is close to billing.",
    },
    practical: {
      rating: "FULL",
      stated: true,
      evidence: "Remote (US)",
      reason: "Remote in the US, and the pay is above your minimum.",
    },
    gaps: ["Java in production", "Kafka", "AWS", "On-call"],
    summary:
      "Close on industry and pay, but it asks for another year of experience and tools you've only studied.",
  },
};

export const SNOWFLAKE_FIT: DemoFit = {
  description: `Software Engineer Intern

Join our engineering team for a 12-week summer internship.

What you'll do
- Contribute to our query engine, written in C++
- Write tests and fix bugs alongside a mentor

Who you are
- Currently enrolled in a Bachelor's or Master's program in Computer Science
- Familiar with C++ or Java
- Interested in databases and distributed systems

This internship is based in our San Mateo office.`,
  ratings: {
    skills: {
      rating: "WEAK",
      stated: true,
      evidence: "Familiar with C++ or Java",
      reason: "You've studied Java but haven't used C++ or Java on real work.",
    },
    seniority: {
      rating: "PARTIAL",
      stated: true,
      evidence: "Currently enrolled in a Bachelor's or Master's program",
      reason:
        "It's for current students, and you've graduated and worked full time.",
    },
    domain: {
      rating: "PARTIAL",
      stated: true,
      evidence: "Interested in databases and distributed systems",
      reason: "You've tuned Postgres at work, but not built a database.",
    },
    practical: {
      rating: "WEAK",
      stated: false,
      evidence: "based in our San Mateo office",
      reason: "It's near San Francisco, but the posting doesn't give the pay.",
    },
    gaps: ["C++"],
    summary: "An internship below your level, in a language you haven't used.",
  },
};
