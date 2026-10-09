"use client";

import { Merge, SplitSquareHorizontal } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  keepBothAction,
  mergeDuplicateAction,
} from "@/app/(app)/activity/actions";
import { Button } from "@/components/ui/button";
import type { DuplicateReview, OpenReviewItem } from "@/server/services/review";
import { ApplicationSummary } from "./application-summary";
import { EmailReviewCard } from "./email-review-card";

/** Decisions Trackr left to the person, one card each. */
export function ReviewQueue({ items }: { items: OpenReviewItem[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id}>
          {item.kind === "POSSIBLE_DUPLICATE" ? (
            <DuplicateCard item={item} />
          ) : (
            <EmailReviewCard item={item} />
          )}
        </li>
      ))}
    </ul>
  );
}

function DuplicateCard({ item }: { item: DuplicateReview }) {
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
