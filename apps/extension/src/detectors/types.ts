import type { SourcePlatform } from "@trackr/domain";
import type { JobContext } from "../shared/types";

export type DetectedJob = Omit<JobContext, "capturedAt">;

/** One job board: how to read its job pages and recognize a submitted application. */
export interface PlatformDetector {
  platform: SourcePlatform;
  matches(url: URL): boolean;
  extractJob(document: Document, url: URL): DetectedJob | null;
  /** Whether the application form is on the page. */
  hasApplicationForm(document: Document): boolean;
  /**
   * How the page shows that an application went through: "url" for a
   * dedicated confirmation page, "state" for a success message that replaced
   * the form. A "state" signal only counts after the form was seen in the
   * same page, so text such as "thank you for applying" alone never does.
   */
  confirmation(document: Document, url: URL): Confirmation | null;
}

export type Confirmation = "url" | "state";
