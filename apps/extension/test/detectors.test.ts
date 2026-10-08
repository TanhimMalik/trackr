import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectorFor } from "../src/detectors";
import { ashby } from "../src/detectors/ashby";
import { greenhouse } from "../src/detectors/greenhouse";
import { lever } from "../src/detectors/lever";

function page(name: string): Document {
  // Relative to the package: under happy-dom, import.meta.url is the fake page.
  const html = readFileSync(join(process.cwd(), "test/fixtures", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

const LEVER_ID = "2f9c6a10-5b7e-4d3a-9c21-8e4f0b6d7a13";
const ASHBY_ID = "0b6f2a52-6d6e-4a8b-9f43-6a0e3c2d1b7a";

describe("detectorFor", () => {
  it("picks the detector for each supported board", () => {
    expect(
      detectorFor(new URL("https://job-boards.greenhouse.io/x/jobs/1")),
    ).toBe(greenhouse);
    expect(detectorFor(new URL("https://jobs.eu.lever.co/x"))).toBe(lever);
    expect(detectorFor(new URL("https://jobs.ashbyhq.com/x"))).toBe(ashby);
    expect(detectorFor(new URL("https://example.com/careers"))).toBeNull();
  });
});

describe("greenhouse", () => {
  const jobUrl = new URL(
    "https://job-boards.greenhouse.io/northwindlabs/jobs/4012345?gh_src=abc",
  );

  it("reads a job board posting", () => {
    expect(greenhouse.extractJob(page("greenhouse-job.html"), jobUrl)).toEqual({
      platform: "GREENHOUSE",
      companyName: "Northwind Labs",
      jobTitle: "Platform Engineer",
      jobUrl: "https://job-boards.greenhouse.io/northwindlabs/jobs/4012345",
      atsJobId: "4012345",
      location: "Remote, Canada",
    });
  });

  it("reads an older board and the embedded form", () => {
    const legacy = page("greenhouse-legacy-job.html");
    expect(
      greenhouse.extractJob(
        legacy,
        new URL("https://boards.greenhouse.io/contosohealth/jobs/77"),
      ),
    ).toMatchObject({
      companyName: "Contoso Health",
      jobTitle: "Data Analyst",
      location: "Boston, MA",
    });
    expect(
      greenhouse.extractJob(
        legacy,
        new URL(
          "https://boards.greenhouse.io/embed/job_app?for=contosohealth&token=77",
        ),
      ),
    ).toMatchObject({
      atsJobId: "77",
      jobUrl: "https://job-boards.greenhouse.io/contosohealth/jobs/77",
    });
  });

  it("ignores pages that aren't a posting", () => {
    expect(
      greenhouse.extractJob(
        page("greenhouse-job.html"),
        new URL("https://job-boards.greenhouse.io/northwindlabs"),
      ),
    ).toBeNull();
  });

  it("recognizes the confirmation page, not the words on a posting", () => {
    const posting = page("greenhouse-job.html");
    expect(greenhouse.hasApplicationForm(posting)).toBe(true);
    expect(greenhouse.confirmation(posting, jobUrl)).toBeNull();
    expect(
      greenhouse.confirmation(
        page("greenhouse-confirmation.html"),
        new URL(
          "https://job-boards.greenhouse.io/northwindlabs/jobs/4012345/confirmation",
        ),
      ),
    ).toBe("url");
  });
});

describe("lever", () => {
  const postingUrl = new URL(`https://jobs.lever.co/fabrikam/${LEVER_ID}`);

  it("reads a posting from its structured data", () => {
    expect(lever.extractJob(page("lever-job.html"), postingUrl)).toEqual({
      platform: "LEVER",
      companyName: "Fabrikam",
      jobTitle: "Backend Engineer, Payments",
      jobUrl: `https://jobs.lever.co/fabrikam/${LEVER_ID}`,
      atsJobId: LEVER_ID,
      location: "Toronto; Montreal",
    });
  });

  it("reads the apply page from its title and points at the posting", () => {
    expect(
      lever.extractJob(
        page("lever-apply.html"),
        new URL(`${postingUrl.href}/apply`),
      ),
    ).toMatchObject({
      companyName: "Fabrikam",
      jobTitle: "Backend Engineer, Payments",
      jobUrl: postingUrl.href,
    });
  });

  it("recognizes the thanks page", () => {
    expect(
      lever.confirmation(
        page("lever-thanks.html"),
        new URL(`${postingUrl.href}/thanks`),
      ),
    ).toBe("url");
    expect(
      lever.confirmation(
        page("lever-apply.html"),
        new URL(`${postingUrl.href}/apply`),
      ),
    ).toBeNull();
  });
});

describe("ashby", () => {
  const postingUrl = new URL(`https://jobs.ashbyhq.com/tailspin/${ASHBY_ID}`);

  it("reads a posting", () => {
    expect(ashby.extractJob(page("ashby-job.html"), postingUrl)).toEqual({
      platform: "ASHBY",
      companyName: "Tailspin",
      jobTitle: "Product Designer",
      jobUrl: postingUrl.href,
      atsJobId: ASHBY_ID,
      location: "New York City, NY",
    });
  });

  it("reads the application tab from its title", () => {
    expect(
      ashby.extractJob(
        page("ashby-application.html"),
        new URL(`${postingUrl.href}/application`),
      ),
    ).toMatchObject({
      companyName: "Tailspin",
      jobTitle: "Product Designer",
      jobUrl: postingUrl.href,
    });
  });

  it("recognizes the success message that replaces the form", () => {
    const application = page("ashby-application.html");
    expect(ashby.hasApplicationForm(application)).toBe(true);
    expect(ashby.confirmation(application, postingUrl)).toBeNull();
    expect(ashby.confirmation(page("ashby-submitted.html"), postingUrl)).toBe(
      "state",
    );
  });

  it("only offers a state signal on a posting whose text thanks applicants", () => {
    // The content script ignores state signals until it has seen the form.
    expect(ashby.confirmation(page("ashby-job.html"), postingUrl)).toBe(
      "state",
    );
    expect(ashby.hasApplicationForm(page("ashby-job.html"))).toBe(false);
  });
});
