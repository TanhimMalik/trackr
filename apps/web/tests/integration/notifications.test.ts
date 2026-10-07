import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApplication } from "@/server/services/applications";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import {
  processApplicationEvent,
  restoreEvent,
  revertEvent,
  type ApplicationEventInput,
} from "@/server/services/events";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createTestUser, daysAgo } from "../helpers/fixtures";

let testDb: TestDatabase;
let userId: string;
let applicationId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  userId = await createTestUser(testDb.db);
  const application = await createApplication(
    userId,
    {
      companyName: "Figma",
      companyWebsite: "figma.com",
      jobTitle: "Frontend Engineer",
      appliedAt: daysAgo(10),
    },
    testDb.db,
  );
  applicationId = application.id;
});

const record = (event: Partial<ApplicationEventInput> = {}) =>
  processApplicationEvent(
    {
      userId,
      applicationId,
      type: "INTERVIEW_REQUESTED",
      occurredAt: daysAgo(1),
      sourceType: "EMAIL",
      dedupeKey: `email:${crypto.randomUUID()}`,
      ...event,
    },
    testDb.db,
  );

const list = () => listNotifications(userId, {}, testDb.db);
const unread = () => countUnreadNotifications(userId, testDb.db);

describe("notifications from events", () => {
  it("announces a status change detected from email", async () => {
    await record();

    expect(await list()).toEqual([
      expect.objectContaining({
        type: "STATUS_CHANGED",
        title: "Figma moved to Interview",
        body: "Frontend Engineer",
        readAt: null,
        applicationId,
        companyName: "Figma",
        companyDomain: "figma.com",
      }),
    ]);
    expect(await unread()).toBe(1);
  });

  it("announces the same email only once", async () => {
    const dedupeKey = "email:message-1";
    await record({ dedupeKey });
    await record({ dedupeKey });

    expect(await list()).toHaveLength(1);
  });

  it("stays quiet about changes made by hand", async () => {
    await record({ sourceType: "MANUAL", dedupeKey: "manual:1" });

    expect(await list()).toEqual([]);
  });

  it("takes the notification back on undo and returns it on restore", async () => {
    const { event } = await record();

    await revertEvent(userId, event.id, testDb.db);
    expect(await list()).toEqual([]);

    await restoreEvent(userId, event.id, testDb.db);
    expect(await list()).toEqual([
      expect.objectContaining({ title: "Figma moved to Interview" }),
    ]);
  });
});

describe("reading notifications", () => {
  it("marks one or all as read", async () => {
    await record();
    await record({ type: "OFFER_RECEIVED" });
    const [offer] = await list();
    expect(offer!.title).toBe("Figma sent you an offer");

    await markNotificationRead(userId, offer!.id, testDb.db);
    expect(await unread()).toBe(1);

    expect(await markAllNotificationsRead(userId, testDb.db)).toBe(1);
    expect(await unread()).toBe(0);
    expect((await list()).every((item) => item.readAt)).toBe(true);
  });

  it("keeps notifications private to their owner", async () => {
    await record();
    const [item] = await list();
    const intruder = await createTestUser(testDb.db);

    expect(await listNotifications(intruder, {}, testDb.db)).toEqual([]);
    await markNotificationRead(intruder, item!.id, testDb.db);
    await markAllNotificationsRead(intruder, testDb.db);
    expect(await unread()).toBe(1);
  });
});

describe("demo notifications", () => {
  it("fills the notification center with recent email activity", async () => {
    const seedUser = await createTestUser(testDb.db);
    const now = new Date("2026-10-07T18:30:00Z");
    const result = await seedDemoWorkspace(seedUser, { now }, testDb.db);

    const items = await listNotifications(seedUser, {}, testDb.db);
    expect(items).toHaveLength(result.notifications);
    expect(items.map((item) => item.title)).toContain(
      "Stripe sent you an offer",
    );
    // The latest few are unread.
    const unreadCount = await countUnreadNotifications(seedUser, testDb.db);
    expect(unreadCount).toBeGreaterThan(0);
    expect(unreadCount).toBeLessThan(items.length);
  });
});
