import { describe, expect, it } from "vitest";
import { firstErrorPerField } from "../forms";
import { authErrorMessage, signInSchema, signUpSchema } from "./forms";

describe("signUpSchema", () => {
  it("normalizes input", () => {
    expect(
      signUpSchema.parse({
        name: "  Tanhim  ",
        email: " Tanhim@Example.COM ",
        password: "correct horse",
      }),
    ).toEqual({
      name: "Tanhim",
      email: "tanhim@example.com",
      password: "correct horse",
    });
  });

  it("treats a blank name as missing", () => {
    expect(
      signUpSchema.parse({
        name: "   ",
        email: "a@example.com",
        password: "12345678",
      }).name,
    ).toBeNull();
  });

  it("reports one message per invalid field", () => {
    const result = signUpSchema.safeParse({
      name: "",
      email: "not-an-email",
      password: "short",
    });
    expect(result.success).toBe(false);
    expect(firstErrorPerField(result.error!)).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    });
  });

  it("rejects passwords longer than bcrypt reads", () => {
    expect(
      signUpSchema.safeParse({
        name: "",
        email: "a@example.com",
        password: "x".repeat(73),
      }).success,
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("does not apply the sign-up password rules", () => {
    expect(
      signInSchema.safeParse({ email: "a@example.com", password: "short" })
        .success,
    ).toBe(true);
    expect(
      signInSchema.safeParse({ email: "a@example.com", password: "" }).success,
    ).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("maps known Supabase error codes", () => {
    expect(authErrorMessage("invalid_credentials")).toBe(
      "Incorrect email or password.",
    );
    expect(authErrorMessage("email_not_confirmed")).toMatch(/confirm/i);
    expect(authErrorMessage("over_email_send_rate_limit")).toMatch(/too many/i);
  });

  it("falls back to a generic message", () => {
    expect(authErrorMessage(undefined)).toBe(
      "Something went wrong. Try again.",
    );
    expect(authErrorMessage("unexpected_failure")).toBe(
      "Something went wrong. Try again.",
    );
  });
});
