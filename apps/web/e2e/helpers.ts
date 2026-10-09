import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Opens a fresh demo workspace from the landing page. */
export async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the live demo" }).click();
  await page.waitForURL("**/overview");
}

/** Ends the demo, deleting its workspace and sign-in. */
export async function endDemo(page: Page) {
  // From a plain page: an open drawer or dialog would cover the banner.
  await page.goto("/overview");
  await page.getByRole("button", { name: "End demo" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** No serious or critical accessibility problems axe can detect. */
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      help: v.help,
      targets: v.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
  expect(serious).toEqual([]);
}
