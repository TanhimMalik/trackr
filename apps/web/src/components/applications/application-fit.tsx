import { FIT_RATINGS } from "@trackr/domain";
import Link from "next/link";
import { DateText } from "@/components/date-text";
import { cn } from "@/lib/utils";
import type { StoredFit } from "@/server/fit/types";
import { FitBadge } from "./fit-badge";
import { ScoreFitButton } from "./score-fit-button";

function Criterion({
  criterion,
}: {
  criterion: StoredFit["criteria"][number];
}) {
  const filled = FIT_RATINGS.indexOf(criterion.rating) / 4;
  return (
    <li className="space-y-1 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{criterion.label}</p>
        <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
          {criterion.points} / {criterion.max}
        </p>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${criterion.points} of ${criterion.max} points`}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${filled * 100}%` }}
        />
      </div>
      <p className="text-muted-foreground">
        {criterion.reason}
        {!criterion.stated && (
          <span className="text-[0.8125rem]">
            {" "}
            The posting doesn&apos;t say, so this scores low.
          </span>
        )}
      </p>
      {criterion.evidence && (
        <p className="border-l-2 pl-2 text-[0.8125rem] text-muted-foreground">
          “{criterion.evidence}”
        </p>
      )}
    </li>
  );
}

/**
 * How well the job fits the person's resume: the four parts of the score,
 * each with the posting's words behind it, and what the resume doesn't show.
 */
export function ApplicationFit({
  applicationId,
  fit,
  scoredAt,
  current,
  description,
  hasProfile,
  canScore,
}: {
  applicationId: string;
  fit: StoredFit | null;
  scoredAt: Date | null;
  /** Scored against the current profile and rubric. */
  current: boolean;
  description: string | null;
  hasProfile: boolean;
  /** Scoring is available to this account right now. */
  canScore: boolean;
}) {
  return (
    <section aria-labelledby="fit-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="fit-heading" className="font-semibold">
          Fit
        </h3>
        {fit && <FitBadge score={fit.score} stale={!current} />}
      </div>

      {fit ? (
        <div className="rounded-xl border bg-card px-4">
          {fit.summary && <p className="border-b py-3">{fit.summary}</p>}
          <ul className="divide-y">
            {fit.criteria.map((criterion) => (
              <Criterion key={criterion.key} criterion={criterion} />
            ))}
          </ul>
          {fit.gaps.length > 0 && (
            <div className="space-y-1.5 border-t py-3">
              <p className="text-[0.8125rem] font-medium">
                Asked for, not on your resume
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {fit.gaps.map((gap) => (
                  <li
                    key={gap}
                    className="rounded-md border bg-background px-1.5 py-0.5 text-xs"
                  >
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t py-3">
            <p className="text-[0.8125rem] text-muted-foreground">
              {current
                ? "Scored by Claude"
                : "Your resume or preferences changed since this was scored"}
              {scoredAt && (
                <>
                  {" · "}
                  <DateText date={scoredAt} relative />
                </>
              )}
            </p>
            {canScore && !current && (
              <ScoreFitButton applicationId={applicationId} rescore />
            )}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className="text-muted-foreground">
            {!hasProfile ? (
              <>
                <Link
                  href="/settings"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Add your resume
                </Link>{" "}
                to see how well this job fits you.
              </>
            ) : !description ? (
              "Add the job description with Edit to see how well this job fits you."
            ) : canScore ? (
              "Not scored yet."
            ) : (
              "Scoring new jobs needs an account. The demo's saved jobs show examples."
            )}
          </p>
          {hasProfile && description && canScore && (
            <ScoreFitButton applicationId={applicationId} />
          )}
        </div>
      )}

      {description && (
        <details className="group rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none group-open:border-b [&::-webkit-details-marker]:hidden">
            Job description
            <span className="ml-1.5 text-muted-foreground group-open:hidden">
              · show
            </span>
          </summary>
          <p className="max-h-96 overflow-y-auto px-4 py-3 whitespace-pre-wrap text-muted-foreground">
            {description}
          </p>
        </details>
      )}
    </section>
  );
}
