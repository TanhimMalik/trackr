import type { SourcePlatform } from "./enums";
import { domainFromUrl } from "./normalize/url";

const PLATFORM_DOMAINS: Partial<Record<string, SourcePlatform>> = {
  "greenhouse.io": "GREENHOUSE",
  "lever.co": "LEVER",
  "ashbyhq.com": "ASHBY",
  "myworkdayjobs.com": "WORKDAY",
  "myworkday.com": "WORKDAY",
  "icims.com": "ICIMS",
  "linkedin.com": "LINKEDIN",
  "indeed.com": "INDEED",
};

// Job boards and applicant tracking systems that host postings for many
// employers. Their domains say nothing about which company is hiring.
const THIRD_PARTY_JOB_DOMAINS = new Set([
  ...Object.keys(PLATFORM_DOMAINS),
  "smartrecruiters.com",
  "jobvite.com",
  "workable.com",
  "bamboohr.com",
  "recruitee.com",
  "breezy.hr",
  "applytojob.com",
  "jazzhr.com",
  "teamtailor.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "wellfound.com",
  "joinhandshake.com",
]);

/** The platform a job URL belongs to; unknown hosts are treated as the company's own site. */
export function detectSourcePlatform(
  jobUrl: string | null | undefined,
): SourcePlatform {
  const domain = jobUrl ? domainFromUrl(jobUrl) : null;
  if (!domain) return "OTHER";
  return (
    PLATFORM_DOMAINS[domain] ??
    (THIRD_PARTY_JOB_DOMAINS.has(domain) ? "OTHER" : "COMPANY_SITE")
  );
}

/** The employer's domain when a job URL is on the company's own site, otherwise null. */
export function employerDomainFromJobUrl(
  jobUrl: string | null | undefined,
): string | null {
  const domain = jobUrl ? domainFromUrl(jobUrl) : null;
  return domain && !THIRD_PARTY_JOB_DOMAINS.has(domain) ? domain : null;
}
