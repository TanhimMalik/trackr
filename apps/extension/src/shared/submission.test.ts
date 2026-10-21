import { extensionSubmissionSchema } from "@trackr/domain";
import { describe, expect, it } from "vitest";
import { buildSubmission, guessJobFromPage, retryDelayMs } from "./submission";

describe("buildSubmission", () => {
  it("produces a payload the API accepts", () => {
    const payload = buildSubmission(
      {
        platform: "LEVER",
        companyName: " Fabrikam ",
        jobTitle: "Backend Engineer",
        jobUrl:
          "https://jobs.lever.co/fabrikam/2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
        atsJobId: "2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13",
        location: "Toronto",
      },
      "AUTO",
    );
    expect(extensionSubmissionSchema.parse(payload)).toMatchObject({
      companyName: "Fabrikam",
      platform: "LEVER",
      captureMode: "AUTO",
    });
  });

  it("says whether the job was applied to or saved", () => {
    const job = {
      companyName: "Acme",
      jobTitle: "Engineer",
      jobUrl: "https://acme.example/jobs/1",
    };
    expect(buildSubmission(job, "AUTO").intent).toBe("APPLIED");
    expect(buildSubmission(job, "POPUP", { intent: "SAVED" }).intent).toBe(
      "SAVED",
    );
  });

  it("sends the description, trimmed to what the API accepts", () => {
    const payload = buildSubmission(
      {
        companyName: "Acme",
        jobTitle: "Engineer",
        jobUrl: "https://acme.example/jobs/1",
        description: "x".repeat(60_000),
      },
      "POPUP",
    );
    expect(payload.description).toHaveLength(50_000);
    expect(extensionSubmissionSchema.safeParse(payload).success).toBe(true);
  });

  it("works out the platform for a job tracked from any page", () => {
    expect(
      buildSubmission(
        {
          companyName: "Acme",
          jobTitle: "Engineer",
          jobUrl: "https://acme.com/careers/1",
        },
        "POPUP",
      ).platform,
    ).toBe("COMPANY_SITE");
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially up to six hours", () => {
    expect([1, 2, 3, 20].map(retryDelayMs)).toEqual([
      60_000,
      120_000,
      240_000,
      6 * 60 * 60_000,
    ]);
  });
});

describe("guessJobFromPage", () => {
  it("prefers the posting the page describes in structured data", () => {
    expect(
      guessJobFromPage({
        url: "https://jobs.example.com/view/42?ref=feed",
        title: "Jobs | Example",
        ogTitle: null,
        siteName: "Example Jobs",
        jsonLd: [
          "not json",
          JSON.stringify({
            "@type": "JobPosting",
            title: "Data Analyst",
            hiringOrganization: { name: "Contoso" },
            jobLocationType: "TELECOMMUTE",
            description: "<p>Own our reporting &amp; dashboards.</p>",
          }),
        ],
      }),
    ).toEqual({
      companyName: "Contoso",
      jobTitle: "Data Analyst",
      jobUrl: "https://jobs.example.com/view/42",
      location: "Remote",
      description: "Own our reporting & dashboards.",
    });
  });

  it("splits a typical careers page title", () => {
    expect(
      guessJobFromPage({
        url: "https://careers.acme.com/jobs/123?utm_source=x",
        title: "Senior Engineer | Acme",
        ogTitle: null,
        siteName: null,
      }),
    ).toEqual({
      companyName: "Acme",
      jobTitle: "Senior Engineer",
      jobUrl: "https://careers.acme.com/jobs/123",
    });
  });

  it("prefers the site name and falls back to the host", () => {
    expect(
      guessJobFromPage({
        url: "https://www.globex.io/role",
        title: "Data Scientist",
        ogTitle: null,
        siteName: null,
      }),
    ).toMatchObject({ companyName: "Globex", jobTitle: "Data Scientist" });
    expect(
      guessJobFromPage({
        url: "https://x.com/jobs/1",
        title: "Designer - Initech",
        ogTitle: null,
        siteName: "Initech Inc.",
      })?.companyName,
    ).toBe("Initech Inc.");
  });

  it("ignores browser pages", () => {
    expect(
      guessJobFromPage({
        url: "chrome://newtab",
        title: "New Tab",
        ogTitle: null,
        siteName: null,
      }),
    ).toBeNull();
  });
});
