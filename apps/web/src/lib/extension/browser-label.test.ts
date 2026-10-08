import { describe, expect, it } from "vitest";
import { browserLabel, EXTENSION_ID_PATTERN } from "./browser-label";

describe("browserLabel", () => {
  it("names the browser and operating system", () => {
    expect(
      browserLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      browserLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("falls back when it can't tell", () => {
    expect(browserLabel(null)).toBe("Browser");
    expect(browserLabel("curl/8.0")).toBe("Browser");
  });
});

describe("EXTENSION_ID_PATTERN", () => {
  it("accepts Chrome extension ids only", () => {
    expect(EXTENSION_ID_PATTERN.test("a".repeat(32))).toBe(true);
    expect(EXTENSION_ID_PATTERN.test("z".repeat(32))).toBe(false);
    expect(EXTENSION_ID_PATTERN.test("a".repeat(31))).toBe(false);
  });
});
