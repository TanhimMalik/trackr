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
