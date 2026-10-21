import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TriageResponse } from "@trackr/domain";
import { describe, expect, it } from "vitest";
import { readJob, type ReadJob } from "../src/reader/read-job";
import {
  itemsFrom,
  keptByDefault,
  ordered,
  postingsFrom,
  toClose,
  toSave,
  type TriageItem,
} from "../src/shared/triage";

function page(name: string): Document {
  const html = readFileSync(join(process.cwd(), "test/fixtures", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("readJob", () => {
  it("reads a supported job board with its detector", () => {
    const job = readJob(
      page("greenhouse-job.html"),
      new URL("https://job-boards.greenhouse.io/northwindlabs/jobs/4012345"),
    );
    expect(job).toMatchObject({
      companyName: "Northwind Labs",
      jobTitle: "Platform Engineer",
      platform: "GREENHOUSE",
      atsJobId: "4012345",
    });
  });

  it("reads any posting a page describes in structured data", () => {
    expect(
      readJob(
        page("jobboard-structured.html"),
        new URL("https://jobs.example.com/viewjob?jk=abc123#apply"),
      ),
    ).toEqual({
      url: "https://jobs.example.com/viewjob?jk=abc123",
      companyName: "Tailspin Health",
      jobTitle: "Junior Software Engineer",
      location: "Remote",
      platform: "COMPANY_SITE",
      atsJobId: null,
      description:
        "Build our patient portal in TypeScript.\n1+ years of experience",
    });
  });

  it("reads LinkedIn's signed-in job view from its details panel", () => {
    expect(
      readJob(
        page("linkedin-signed-in.html"),
        new URL(
          "https://www.linkedin.com/jobs/search/?currentJobId=4479305237&keywords=engineer",
        ),
      ),
    ).toMatchObject({
      url: "https://www.linkedin.com/jobs/view/4479305237/",
      companyName: "Contoso",
      jobTitle: "Software Engineer I",
      platform: "LINKEDIN",
      description: expect.stringContaining("React and Go"),
    });
  });

  it("finds nothing on a page that isn't a posting", () => {
    expect(
      readJob(page("lever-thanks.html"), new URL("https://example.com/blog")),
    ).toBeNull();
  });
});

const job = (url: string, fields: Partial<ReadJob> = {}): ReadJob => ({
  url,
  companyName: "Acme",
  jobTitle: "Engineer",
  location: null,
  platform: "OTHER",
  atsJobId: null,
  description: "A posting.",
  ...fields,
});

describe("postingsFrom", () => {
  it("groups tabs by posting and counts what it couldn't read", () => {
    const result = postingsFrom([
      { tabId: 1, job: job("https://a.example/1") },
      { tabId: 2, job: null },
      { tabId: 3, job: job("https://a.example/1") },
      { tabId: 4, job: job("https://b.example/2") },
    ]);
    expect(result.postings.map((p) => [p.key, p.tabIds])).toEqual([
      ["https://a.example/1", [1, 3]],
      ["https://b.example/2", [4]],
    ]);
    expect(result.unreadable).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("checks at most 30 postings", () => {
    const tabs = Array.from({ length: 33 }, (_, i) => ({
      tabId: i,
      job: job(`https://a.example/${i}`),
    }));
    const result = postingsFrom(tabs);
    expect(result.postings).toHaveLength(30);
    expect(result.skipped).toBe(3);
  });
});

describe("choosing what to keep", () => {
  const scored = (url: string, score: number) => ({
    url,
    status: "SCORED" as const,
    fit: {
      score,
      label: (score >= 75 ? "STRONG" : score >= 55 ? "POSSIBLE" : "STRETCH") as
        "STRONG" | "POSSIBLE" | "STRETCH",
      criteria: [],
      gaps: [],
      summary: "",
    },
    trackedApplicationId: null,
  });
  const response: TriageResponse = {
    hasProfile: true,
    results: [
      scored("https://a.example/stretch", 40),
      scored("https://a.example/strong", 88),
      {
        ...scored("https://a.example/tracked", 30),
        trackedApplicationId: "app-1",
      },
      {
        url: "https://a.example/short",
        status: "NO_DESCRIPTION",
        fit: null,
        trackedApplicationId: null,
      },
      scored("https://a.example/possible", 63),
    ],
  };
  const items: TriageItem[] = itemsFrom(
    response.results.map((result, i) => ({
      key: result.url,
      tabIds: [i],
      job: job(result.url),
    })),
    response,
  );

  it("lists the best fits first", () => {
    expect(ordered(items).map((item) => item.fit?.score ?? null)).toEqual([
      88,
      63,
      40,
      30,
      null,
    ]);
  });

  it("keeps strong fits, and never closes tracked or unscored postings", () => {
    const kept = keptByDefault(items);
    expect([...kept]).toEqual(["https://a.example/strong"]);
    expect(toSave(items, kept).map((item) => item.key)).toEqual([
      "https://a.example/strong",
    ]);
    expect(toClose(items, kept).map((item) => item.key)).toEqual([
      "https://a.example/stretch",
      "https://a.example/possible",
    ]);
  });

  it("follows the person's choices", () => {
    const kept = new Set(["https://a.example/possible"]);
    expect(toSave(items, kept).map((item) => item.key)).toEqual([
      "https://a.example/possible",
    ]);
    expect(toClose(items, kept).map((item) => item.key)).toEqual([
      "https://a.example/stretch",
      "https://a.example/strong",
    ]);
  });

  it("leaves saved and closed postings out of later actions", () => {
    const after = items.map((item) =>
      item.key === "https://a.example/strong"
        ? { ...item, saved: true, applicationId: "app-2" }
        : item.key === "https://a.example/stretch"
          ? { ...item, closed: true }
          : item,
    );
    const kept = keptByDefault(after);
    expect(toSave(after, kept)).toEqual([]);
    expect(toClose(after, kept).map((item) => item.key)).toEqual([
      "https://a.example/possible",
    ]);
  });
});
