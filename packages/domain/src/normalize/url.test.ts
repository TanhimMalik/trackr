import { describe, expect, it } from "vitest";
import {
  domainFromEmail,
  domainFromUrl,
  normalizeJobUrl,
  registrableDomain,
} from "./url";

describe("normalizeJobUrl", () => {
  it("removes tracking parameters, fragments and trailing slashes", () => {
    expect(
      normalizeJobUrl(
        "https://www.Example.com/careers/123/?utm_source=linkedin&gh_src=abc#apply",
      ),
    ).toBe("https://example.com/careers/123");
    expect(
      normalizeJobUrl(
        "https://jobs.lever.co/acme/1f2e3d?lever-source%5B%5D=LinkedIn&lever-origin=applied",
      ),
    ).toBe("https://jobs.lever.co/acme/1f2e3d");
  });

  it("keeps meaningful parameters in a stable order", () => {
    expect(
      normalizeJobUrl("http://acme.com/jobs?team=eng&gh_jid=4012345&ref=x"),
    ).toBe("https://acme.com/jobs?gh_jid=4012345&team=eng");
  });

  it("treats equivalent URLs as equal", () => {
    expect(
      normalizeJobUrl("https://boards.greenhouse.io/datadog/jobs/123?gh_src=x"),
    ).toBe(normalizeJobUrl("https://boards.greenhouse.io/datadog/jobs/123/"));
  });

  it("rejects values that are not web URLs", () => {
    expect(normalizeJobUrl("not a url")).toBeNull();
    expect(normalizeJobUrl("mailto:jobs@acme.com")).toBeNull();
    expect(normalizeJobUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("registrableDomain", () => {
  it.each([
    ["careers.stripe.com", "stripe.com"],
    ["www.notion.so", "notion.so"],
    ["stripe.com", "stripe.com"],
    ["jobs.bbc.co.uk", "bbc.co.uk"],
    ["boards.greenhouse.io", "greenhouse.io"],
  ])("%s → %s", (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });

  it("returns null for hosts without a domain", () => {
    expect(registrableDomain("localhost")).toBeNull();
    expect(registrableDomain("127.0.0.1")).toBeNull();
  });
});

describe("domain helpers", () => {
  it("extracts domains from URLs and email addresses", () => {
    expect(domainFromUrl("https://careers.figma.com/jobs/1")).toBe("figma.com");
    expect(domainFromUrl("nope")).toBeNull();
    expect(domainFromEmail("Jane.Doe@Recruiting.Stripe.com")).toBe(
      "stripe.com",
    );
    expect(domainFromEmail("not-an-email")).toBeNull();
  });
});
