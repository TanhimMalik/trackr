import {
  APPLICATION_STATUS_LABELS,
  cardSignal,
  type ApplicationStatus,
  type CardSignalInput,
} from "@trackr/domain";
import { Mail, Puzzle } from "lucide-react";
import { ApplicationCard } from "@/components/applications/application-card";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { StatusDot } from "@/components/applications/status-badge";

const DAY_MS = 24 * 60 * 60 * 1000;

type PreviewCard = {
  companyName: string;
  companyDomain: string;
  jobTitle: string;
  status: ApplicationStatus;
  appliedDaysAgo: number;
  signal: CardSignalInput;
};

const extension = { sourceType: "BROWSER_EXTENSION" } as const;
const event = (
  type: NonNullable<CardSignalInput["latestSignalEvent"]>["type"],
  metadata?: { isFinalRound?: boolean },
): CardSignalInput => ({
  latestSignalEvent: { type, metadata },
  originEvent: extension,
  source: null,
});

const COLUMNS: {
  label: string;
  status: ApplicationStatus;
  cards: PreviewCard[];
}[] = [
  {
    label: "Applied",
    status: "APPLIED",
    cards: [
      {
        companyName: "Discord",
        companyDomain: "discord.com",
        jobTitle: "Software Engineer, Infrastructure",
        status: "APPLIED",
        appliedDaysAgo: 2,
        signal: {
          latestSignalEvent: null,
          originEvent: extension,
          source: null,
        },
      },
      {
        companyName: "Shopify",
        companyDomain: "shopify.com",
        jobTitle: "Developer",
        status: "APPLIED",
        appliedDaysAgo: 6,
        signal: {
          latestSignalEvent: null,
          originEvent: { sourceType: "EMAIL" },
          source: null,
        },
      },
    ],
  },
  {
    label: "Assessment",
    status: "ASSESSMENT",
    cards: [
      {
        companyName: "Figma",
        companyDomain: "figma.com",
        jobTitle: "Frontend Engineer",
        status: "ASSESSMENT",
        appliedDaysAgo: 21,
        signal: event("ASSESSMENT_RECEIVED"),
      },
      {
        companyName: "Datadog",
        companyDomain: "datadoghq.com",
        jobTitle: "Software Engineer",
        status: "ASSESSMENT",
        appliedDaysAgo: 24,
        signal: event("ASSESSMENT_RECEIVED"),
      },
    ],
  },
  {
    label: "Interview",
    status: "INTERVIEW",
    cards: [
      {
        companyName: "Ramp",
        companyDomain: "ramp.com",
        jobTitle: "Software Engineer, Backend",
        status: "INTERVIEW",
        appliedDaysAgo: 27,
        signal: event("INTERVIEW_SCHEDULED"),
      },
      {
        companyName: "Duolingo",
        companyDomain: "duolingo.com",
        jobTitle: "Software Engineer",
        status: "FINAL_ROUND",
        appliedDaysAgo: 31,
        signal: event("NEXT_ROUND", { isFinalRound: true }),
      },
    ],
  },
  {
    label: "Offer",
    status: "OFFER",
    cards: [
      {
        companyName: "Stripe",
        companyDomain: "stripe.com",
        jobTitle: "Software Engineer, New Grad",
        status: "OFFER",
        appliedDaysAgo: 46,
        signal: event("OFFER_RECEIVED"),
      },
    ],
  },
];

const AUTOMATION = [
  {
    companyName: "Stripe",
    companyDomain: "stripe.com",
    title: "Offer received",
    detail: `${APPLICATION_STATUS_LABELS.FINAL_ROUND} → ${APPLICATION_STATUS_LABELS.OFFER} · Gmail · 98%`,
    icon: <Mail aria-hidden="true" />,
  },
  {
    companyName: "Discord",
    companyDomain: "discord.com",
    title: "Applied",
    detail: "Captured by the extension on submit",
    icon: <Puzzle aria-hidden="true" />,
  },
  {
    companyName: "Ramp",
    companyDomain: "ramp.com",
    title: "Interview scheduled",
    detail: `${APPLICATION_STATUS_LABELS.RECRUITER_SCREEN} → ${APPLICATION_STATUS_LABELS.INTERVIEW} · Gmail · 97%`,
    icon: <Mail aria-hidden="true" />,
  },
];

/**
 * A still picture of the product for the landing page, built from the app's
 * own components and the demo's companies. Dates are relative to `now`.
 */
export function ProductPreview({ now }: { now: Date }) {
  return (
    <figure
      aria-label="A preview of the Trackr board and its automatic updates"
      className="overflow-hidden rounded-xl border bg-background shadow-sm"
    >
      <div className="grid xl:grid-cols-[1fr_20rem]">
        <div className="flex gap-3 overflow-x-auto p-3">
          {COLUMNS.map((column) => (
            <div
              key={column.label}
              className="flex w-[15.5rem] shrink-0 flex-col gap-2 rounded-xl bg-column p-2"
            >
              <div className="flex items-center gap-2 px-1.5 pt-0.5">
                <StatusDot status={column.status} />
                <span className="font-medium">{column.label}</span>
                <span className="rounded-md bg-background px-1.5 text-xs leading-5 text-muted-foreground tabular-nums">
                  {column.cards.length}
                </span>
              </div>
              {column.cards.map((card) => (
                <ApplicationCard
                  key={card.companyName}
                  showStatus={card.status !== column.status}
                  item={{
                    id: card.companyName,
                    companyName: card.companyName,
                    companyDomain: card.companyDomain,
                    jobTitle: card.jobTitle,
                    status: card.status,
                    appliedAt: new Date(
                      now.getTime() - card.appliedDaysAgo * DAY_MS,
                    ),
                    createdAt: new Date(
                      now.getTime() - card.appliedDaysAgo * DAY_MS,
                    ),
                    signal: cardSignal(card.signal),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="border-t p-4 xl:border-t-0 xl:border-l">
          <p className="font-semibold">Recent automation</p>
          <ul className="mt-3 flex flex-col gap-3">
            {AUTOMATION.map((item) => (
              <li key={item.title} className="flex items-center gap-3">
                <CompanyAvatar
                  name={item.companyName}
                  domain={item.companyDomain}
                  className="size-7"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{item.companyName}</span>
                    <span className="text-muted-foreground"> · </span>
                    {item.title}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground [&_svg]:size-3">
                    {item.icon}
                    {item.detail}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-success"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}
