import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { findUserByEmail, upsertUser } from "@/server/services/users";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

const findUser = async (id: string) => {
  const [user] = await testDb.db.select().from(users).where(eq(users.id, id));
  return user;
};

describe("upsertUser", () => {
  it("creates the user on first sign-in", async () => {
    const id = crypto.randomUUID();
    await upsertUser({ id, email: "ada@example.com", name: "Ada" }, testDb.db);

    expect(await findUser(id)).toMatchObject({
      id,
      email: "ada@example.com",
      name: "Ada",
    });
  });

  it("is idempotent", async () => {
    const id = crypto.randomUUID();
    const user = { id, email: "grace@example.com", name: "Grace" };
    await upsertUser(user, testDb.db);
    await upsertUser(user, testDb.db);

    expect(
      await testDb.db.select().from(users).where(eq(users.id, id)),
    ).toHaveLength(1);
  });

  it("refreshes the email and name on later sign-ins", async () => {
    const id = crypto.randomUUID();
    await upsertUser({ id, email: "old@example.com", name: "Old" }, testDb.db);
    const before = await findUser(id);

    await upsertUser({ id, email: "new@example.com", name: "New" }, testDb.db);
    const after = await findUser(id);

    expect(after).toMatchObject({ email: "new@example.com", name: "New" });
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before!.updatedAt.getTime(),
    );
  });

  it("keeps a stored name when a sign-in has none", async () => {
    const id = crypto.randomUUID();
    await upsertUser({ id, email: "kim@example.com", name: "Kim" }, testDb.db);
    await upsertUser({ id, email: "kim@example.com", name: null }, testDb.db);

    expect((await findUser(id))!.name).toBe("Kim");
  });
});

describe("findUserByEmail", () => {
  it("finds a user regardless of letter case and spacing", async () => {
    const id = crypto.randomUUID();
    await upsertUser(
      { id, email: "Mixed.Case@Example.com", name: null },
      testDb.db,
    );

    expect(
      await findUserByEmail("  mixed.case@example.COM ", testDb.db),
    ).toEqual({
      id,
      email: "Mixed.Case@Example.com",
    });
    expect(await findUserByEmail("nobody@example.com", testDb.db)).toBeNull();
  });
});
