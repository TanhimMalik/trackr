"use client";

import { Merge, SplitSquareHorizontal } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  keepBothAction,
  mergeDuplicateAction,
} from "@/app/(app)/activity/actions";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { StatusBadge } from "@/components/applications/status-badge";
import { DateText } from "@/components/date-text";
import { Button } from "@/components/ui/button";
import type {
  OpenReviewItem,
  ReviewApplication,
} from "@/server/services/review";

/** Decisions Trackr left to the person, one card each. */
export function ReviewQueue({ items }: { items: OpenReviewItem[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <DuplicateCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ApplicationSummary({
  label,
  application,
}: {
  label: string;
  application: ReviewApplication;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-background p-3 has-[a:hover]:bg-muted/40">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <CompanyAvatar
          name={application.companyName}
          domain={application.companyDomain}
        />
        <div className="min-w-0">
          <Link
            href={`/applications/${application.id}`}
            className="block truncate font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {application.companyName}
          </Link>
          <p className="truncate text-muted-foreground">
            {application.jobTitle}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <StatusBadge status={application.status} />
        {application.appliedAt && (
          <span>
            Applied <DateText date={application.appliedAt} />
          </span>
        )}
      </div>
    </div>
  );
}

function DuplicateCard({ item }: { item: OpenReviewItem }) {
  const [pending, startTransition] = useTransition();

  function resolve(action: (id: string) => ReturnType<typeof keepBothAction>) {
    startTransition(async () => {
      const result = await action(item.id);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.error ?? "Something went wrong. Try again.");
    });
  }

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="space-y-0.5">
        <h3 className="font-semibold">Possible duplicate</h3>
        <p className="text-muted-foreground">
          The extension recorded an application that looks like one you already
          track.
          {item.matchReasons.length > 0 && ` ${item.matchReasons.join(" · ")}.`}
        </p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <ApplicationSummary
          label="Just recorded"
          application={item.application}
        />
        {item.candidate && (
          <ApplicationSummary
            label="Already tracked"
            application={item.candidate}
          />
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => resolve(keepBothAction)}
        >
          <SplitSquareHorizontal aria-hidden="true" />
          Keep both
        </Button>
        {item.candidate && (
          <Button
            disabled={pending}
            onClick={() => resolve(mergeDuplicateAction)}
          >
            <Merge aria-hidden="true" />
            Merge into existing
          </Button>
        )}
      </div>
    </article>
  );
}
