import type { CaptureMode, SourcePlatform } from "@trackr/domain";

/**
 * Submissions a demo visitor can send through the real ingestion pipeline,
 * to see what the extension does without installing it. Each one shows a
 * different outcome against the demo data.
 */
export type DemoCapture = {
  id: "new-job" | "saved-job" | "similar-role";
  title: string;
  description: string;
  captureMode: CaptureMode;
  platform: SourcePlatform;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  location: string;
};

export const DEMO_CAPTURES: readonly DemoCapture[] = [
  {
    id: "new-job",
    title: "Track a new job from the popup",
    description: "Retool · Software Engineer, on its careers site",
    captureMode: "POPUP",
    platform: "COMPANY_SITE",
    companyName: "Retool",
    jobTitle: "Software Engineer",
    jobUrl: "https://retool.com/careers",
    location: "San Francisco, CA",
  },
  {
    id: "saved-job",
    title: "Apply to a job you saved",
    description: "Snowflake · Software Engineer Intern, saved two days ago",
    captureMode: "POPUP",
    platform: "COMPANY_SITE",
    companyName: "Snowflake",
    jobTitle: "Software Engineer Intern",
    jobUrl: "https://careers.snowflake.com",
    location: "San Mateo, CA",
  },
  {
    id: "similar-role",
    title: "Apply on Greenhouse to a similar role",
    description:
      "Stripe · Software Engineer, next to your New Grad application",
    captureMode: "AUTO",
    platform: "GREENHOUSE",
    companyName: "Stripe",
    jobTitle: "Software Engineer",
    jobUrl: "https://job-boards.greenhouse.io/stripe",
    location: "Seattle, WA",
  },
];
