import { expect, test, type Page } from "@playwright/test";
import { endDemo, expectAccessible, startDemo } from "./helpers";

// One demo workspace for the whole file: Supabase rate-limits anonymous
// sign-ins, and each test leaves the sample data in a known state for the
// next (they touch different applications).
test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  page = await context.newPage();
  await startDemo(page);
});

test.afterAll(async () => {
  await endDemo(page);
  await page.context().close();
});

test("the demo opens on a populated overview", async () => {
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Good (morning|afternoon|evening)/,
    }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("the board shows every stage and opens an application", async () => {
  await page.goto("/applications");
  for (const stage of [
    "Saved",
    "Applied",
    "Assessment",
    "Interview",
    "Offer",
    "Closed",
  ]) {
    await expect(
      page.getByRole("region", { name: new RegExp(`^${stage},`) }),
    ).toBeVisible();
  }
  await expectAccessible(page);

  await page.getByRole("link", { name: "Stripe" }).click();
  await expect(page.getByRole("heading", { name: "Stripe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expectAccessible(page);
});

test("an application can be moved with the keyboard", async () => {
  // Keyboard handlers only exist once the page has hydrated.
  await page.goto("/applications?q=coinbase", { waitUntil: "networkidle" });
  const announcer = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole("button", { name: /^Move Coinbase/ }).focus();
  await page.keyboard.press("Space");
  await expect(announcer).toContainText("Coinbase is over Applied.");
  // The sensor listens for arrows a moment after the pickup; press again
  // only while the card hasn't moved, so it can never overshoot.
  await expect(async () => {
    if ((await announcer.textContent())?.includes("over Applied")) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(announcer).toContainText("Coinbase is over Assessment.", {
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(page.getByText("Coinbase moved to Assessment.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^Assessment, 1/ }),
  ).toBeVisible();
});

test("a delivered email moves its application forward", async () => {
  await page.goto("/integrations");
  await expectAccessible(page);
  const plaid = page
    .getByRole("listitem")
    .filter({ hasText: "Plaid Recruiting" });
  await plaid.getByRole("button", { name: "Deliver" }).click();
  await expect(
    page.getByText("Read it and updated the application."),
  ).toBeVisible();

  await page.goto("/applications?q=plaid");
  await expect(
    page.getByRole("region", { name: /^Interview, 1/ }),
  ).toBeVisible();
});

test("a simulated capture adds a new application", async () => {
  await page.goto("/integrations");
  const retool = page
    .getByRole("listitem")
    .filter({ hasText: "Track a new job from the popup" });
  await retool.getByRole("button", { name: "Simulate" }).click();
  await expect(
    page.getByText("Retool was added to your board as Applied."),
  ).toBeVisible();

  await page.goto("/applications?q=retool");
  await expect(page.getByRole("region", { name: /^Applied, 1/ })).toBeVisible();
});

test("settings save and are accessible", async () => {
  await page.goto("/settings");
  await expectAccessible(page);
  const auto = page.getByRole("switch", {
    name: "Update applications automatically",
  });
  await auto.click();
  await expect(
    page.getByText("Every update from email will wait for you to confirm it."),
  ).toBeVisible();
  await page.reload();
  await expect(auto).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Ask before less certain updates" }),
  ).toBeDisabled();
});
