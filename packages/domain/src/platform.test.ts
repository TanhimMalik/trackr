import { describe, expect, it } from "vitest";
import { detectSourcePlatform, employerDomainFromJobUrl } from "./platform";

describe("detectSourcePlatform", () => {
  it.each([
    ["https://boards.greenhouse.io/datadog/jobs/4012345", "GREENHOUSE"],
    ["https://job-boards.greenhouse.io/figma/jobs/123", "GREENHOUSE"],
    ["https://jobs.lever.co/plaid/5f1c2a", "LEVER"],
    ["https://jobs.ashbyhq.com/ramp/9a8b7c", "ASHBY"],
    ["https://stripe.wd5.myworkdayjobs.com/en-US/jobs/job/123", "WORKDAY"],
    ["https://www.linkedin.com/jobs/view/123456", "LINKEDIN"],
    ["https://www.indeed.com/viewjob?jk=abc", "INDEED"],
    ["https://careers.notion.so/jobs/123", "COMPANY_SITE"],
    ["https://jobs.smartrecruiters.com/Acme/123", "OTHER"],
  ] as const)("%s → %s", (url, platform) => {
    expect(detectSourcePlatform(url)).toBe(platform);
  });

  it("falls back to other without a usable URL", () => {
    expect(detectSourcePlatform(null)).toBe("OTHER");
    expect(detectSourcePlatform("not a url")).toBe("OTHER");
  });
});

describe("employerDomainFromJobUrl", () => {
  it("returns the employer's domain for company career sites", () => {
    expect(employerDomainFromJobUrl("https://careers.stripe.com/jobs/1")).toBe(
      "stripe.com",
    );
  });

  it("ignores job boards and applicant tracking systems", () => {
    expect(
      employerDomainFromJobUrl("https://boards.greenhouse.io/datadog/jobs/1"),
    ).toBeNull();
    expect(
      employerDomainFromJobUrl("https://www.linkedin.com/jobs/view/1"),
    ).toBeNull();
    expect(employerDomainFromJobUrl(undefined)).toBeNull();
  });
});
