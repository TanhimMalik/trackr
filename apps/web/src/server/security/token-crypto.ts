import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { tokenEncryptionKey } from "@/server/env";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

const encode = (buffer: Buffer) => buffer.toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url");

/**
 * Encrypts a secret for storage as `v1.<iv>.<ciphertext>.<tag>`. AES-256-GCM
 * with a random IV, so equal secrets never look alike and tampering is detected.
 */
export function encryptSecret(
  plain: string,
  key = tokenEncryptionKey(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    encode(iv),
    encode(ciphertext),
    encode(cipher.getAuthTag()),
  ].join(".");
}

export function decryptSecret(
  stored: string,
  key = tokenEncryptionKey(),
): string {
  const [version, iv, ciphertext, tag] = stored.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag) {
    throw new Error("Unrecognized encrypted secret format");
  }
  const decipher = createDecipheriv(ALGORITHM, key, decode(iv));
  decipher.setAuthTag(decode(tag));
  return Buffer.concat([
    decipher.update(decode(ciphertext)),
    decipher.final(),
  ]).toString("utf8");
}
