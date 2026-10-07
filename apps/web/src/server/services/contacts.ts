import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { contactInputSchema } from "@/lib/applications/details-input";
import { getDb } from "@/server/db/client";
import { applications, contacts } from "@/server/db/schema";
import type { Contact, Database } from "@/server/db/types";
import { DuplicateContactError, NotFoundError } from "./errors";
import { assertId } from "./ids";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return (candidate.cause?.code ?? candidate.code) === UNIQUE_VIOLATION;
}

export async function listContacts(
  userId: string,
  applicationId: string,
  db: Database = getDb(),
): Promise<Contact[]> {
  return db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.applicationId, applicationId),
        eq(contacts.userId, userId),
      ),
    )
    .orderBy(asc(contacts.createdAt));
}

export async function createContact(
  userId: string,
  applicationId: string,
  /** Validated here with `contactInputSchema`. */
  input: unknown,
  db: Database = getDb(),
): Promise<Contact> {
  const data = contactInputSchema.parse(input);
  assertId(applicationId, "Application");
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    );
  if (!application) throw new NotFoundError("Application");

  try {
    const [row] = await db
      .insert(contacts)
      .values({ ...data, userId, applicationId })
      .returning();
    return row!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateContactError();
    throw error;
  }
}

export async function updateContact(
  userId: string,
  contactId: string,
  /** Validated here with `contactInputSchema`. */
  input: unknown,
  db: Database = getDb(),
): Promise<Contact> {
  const data = contactInputSchema.parse(input);
  assertId(contactId, "Contact");
  try {
    // An edit replaces every field; anything left blank is cleared.
    const [row] = await db
      .update(contacts)
      .set({
        name: data.name,
        email: data.email ?? null,
        title: data.title ?? null,
        contactType: data.contactType,
      })
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
      .returning();
    if (!row) throw new NotFoundError("Contact");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateContactError();
    throw error;
  }
}

export async function deleteContact(
  userId: string,
  contactId: string,
  db: Database = getDb(),
): Promise<void> {
  assertId(contactId, "Contact");
  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });
  if (deleted.length === 0) throw new NotFoundError("Contact");
}
