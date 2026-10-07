import { describe, expect, it } from "vitest";
import {
  applicationFormValues,
  appliedDateToIso,
  localDateInputValue,
  NO_SELECTION,
  parseMoney,
} from "./form-data";
import { createApplicationSchema, updateApplicationSchema } from "./input";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

describe("parseMoney", () => {
  it.each([
    ["150000", 150_000],
    ["150,000", 150_000],
    ["$150,000", 150_000],
    ["150k", 150_000],
    ["152.5K", 152_500],
    ["", null],
    ["   ", null],
  ])("%s → %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it("returns NaN for values that are not amounts", () => {
    expect(parseMoney("lots")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
  });
});

describe("applicationFormValues", () => {
  it("maps a complete form", () => {
    const values = applicationFormValues(
      form({
        companyName: "Stripe",
        companyWebsite: "stripe.com",
        jobTitle: "Software Engineer",
        jobUrl: "https://stripe.com/jobs/1",
        location: " San Francisco ",
        employmentType: "FULL_TIME",
        salaryMin: "150k",
        salaryMax: "185,000",
        salaryCurrency: "USD",
        source: "LINKEDIN",
        sourcePlatform: NO_SELECTION,
        notes: "",
        status: "INTERVIEW",
        appliedAt: "2026-10-01T16:00:00.000Z",
      }),
    );

    expect(values).toEqual({
      companyName: "Stripe",
      companyWebsite: "stripe.com",
      jobTitle: "Software Engineer",
      jobUrl: "https://stripe.com/jobs/1",
      location: "San Francisco",
      employmentType: "FULL_TIME",
      salaryMin: 150_000,
      salaryMax: 185_000,
      salaryCurrency: "USD",
      source: "LINKEDIN",
      sourcePlatform: null,
      notes: null,
      status: "INTERVIEW",
      appliedAt: "2026-10-01T16:00:00.000Z",
    });
    expect(createApplicationSchema.safeParse(values).success).toBe(true);
  });

  it("drops the currency when no salary is given", () => {
    const values = applicationFormValues(
      form({ companyName: "A", jobTitle: "B", salaryCurrency: "USD" }),
    );
    expect(values.salaryCurrency).toBeNull();
  });

  it("leaves create-only fields out of edits", () => {
    const values = applicationFormValues(
      form({ companyName: "A", jobTitle: "B" }),
    );
    expect(values.status).toBeUndefined();
    expect(values.appliedAt).toBeUndefined();
    expect(updateApplicationSchema.safeParse(values).success).toBe(true);
  });

  it("lets validation report a salary that is not a number", () => {
    const result = createApplicationSchema.safeParse(
      applicationFormValues(
        form({ companyName: "A", jobTitle: "B", salaryMin: "lots" }),
      ),
    );
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]).toMatchObject({
      path: ["salaryMin"],
      message: "Enter an amount, like 120000 or 120k.",
    });
  });
});

describe("appliedDateToIso", () => {
  const now = new Date(2026, 9, 7, 9, 30); // local time

  it("uses the current time for today", () => {
    expect(appliedDateToIso(localDateInputValue(now), now)).toBe(
      now.toISOString(),
    );
  });

  it("anchors other days at local noon", () => {
    expect(appliedDateToIso("2026-10-01", now)).toBe(
      new Date(2026, 9, 1, 12, 0).toISOString(),
    );
  });

  it("ignores empty or invalid values", () => {
    expect(appliedDateToIso("", now)).toBeUndefined();
    expect(appliedDateToIso("not-a-date", now)).toBeUndefined();
  });
});
