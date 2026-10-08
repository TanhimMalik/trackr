import { describe, expect, it } from "vitest";
import { extensionSubmissionSchema, plainTextDescription } from "./extension";

const valid = {
  clientSubmissionId: "2c6c3f1e-8d1a-4b6e-9f1a-1d2c3b4a5f60",
  captureMode: "AUTO",
  platform: "GREENHOUSE",
  companyName: " Example Corp ",
  jobTitle: "Software Engineer",
  jobUrl: "https://boards.greenhouse.io/example/jobs/123456",
  atsJobId: "123456",
  location: "",
  submittedAt: "2026-10-01T15:04:05.000Z",
};

describe("extensionSubmissionSchema", () => {
  it("accepts the documented payload", () => {
    expect(extensionSubmissionSchema.parse(valid)).toMatchObject({
      companyName: "Example Corp",
      atsJobId: "123456",
      location: null,
      description: null,
    });
  });

  it("rejects unsafe or impossible values", () => {
    for (const patch of [
      { jobUrl: "javascript:alert(1)" },
      { clientSubmissionId: "not-a-uuid" },
      { companyName: "" },
      { submittedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      { platform: "MYSPACE" },
    ]) {
      expect(
        extensionSubmissionSchema.safeParse({ ...valid, ...patch }).success,
      ).toBe(false);
    }
  });
});

describe("plainTextDescription", () => {
  it("keeps the words and drops the markup", () => {
    expect(
      plainTextDescription(
        "<h2>About</h2><p>We build&nbsp;tools &amp; more.</p><script>alert(1)</script><ul><li>Go</li><li>Rust</li></ul>",
      ),
    ).toBe("About\nWe build tools & more.\nGo\nRust");
  });
});
