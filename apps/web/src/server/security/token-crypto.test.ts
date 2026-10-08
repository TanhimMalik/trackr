import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./token-crypto";

const key = randomBytes(32);

describe("token encryption", () => {
  it("round-trips, and never produces the same ciphertext twice", () => {
    const first = encryptSecret("ya29.secret-token", key);
    const second = encryptSecret("ya29.secret-token", key);

    expect(first).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(first).not.toContain("secret-token");
    expect(first).not.toBe(second);
    expect(decryptSecret(first, key)).toBe("ya29.secret-token");
  });

  it("rejects tampering and the wrong key", () => {
    const stored = encryptSecret("ya29.secret-token", key);
    const [version, iv, ciphertext, tag] = stored.split(".");
    const flipped = `${ciphertext!.slice(0, -2)}${ciphertext!.endsWith("A") ? "B" : "A"}${ciphertext!.slice(-1)}`;

    expect(() =>
      decryptSecret([version, iv, flipped, tag].join("."), key),
    ).toThrow();
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
    expect(() => decryptSecret("plain-text", key)).toThrow();
  });
});
