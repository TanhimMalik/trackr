"use client";

import { APPLICATION_EVENT_LABELS } from "@trackr/domain";
import { Check, ExternalLink, Mail, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applyEmailReviewAction,
  createApplicationFromEmailAction,
  dismissEmailReviewAction,
} from "@/app/(app)/activity/actions";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { DateText } from "@/components/date-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmailReview } from "@/server/services/review";
import { ApplicationSummary } from "./application-summary";

const HEADINGS: Record<EmailReview["kind"], string> = {
  EMAIL_POSSIBLE_MATCH: "Is this email about this application?",
  LOW_CONFIDENCE_UPDATE: "Check this update before it's applied",
  EMAIL_UNMATCHED: "An email about a job Trackr doesn't know",
};

/** One email Trackr wasn't sure about: what it says, and what Trackr would do. */
export function EmailReviewCard({ item }: { item: EmailReview }) {
  const { email } = item;
  const [pending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState(email.companyName ?? "");
  const [jobTitle, setJobTitle] = useState(email.jobTitle ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = item.eventType
    ? APPLICATION_EVENT_LABELS[item.eventType]
    : null;

  function run(action: () => Promise<ApplicationFormState>) {
    startTransition(async () => {
      const result = await action();
      if (result?.ok) toast.success(result.message);
      else if (result?.fieldErrors) setErrors(result.fieldErrors);
      else toast.error(result?.error ?? "Something went wrong. Try again.");
    });
  }

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="space-y-0.5">
        <h3 className="font-semibold">{HEADINGS[item.kind]}</h3>
        {update && (
          <p className="text-muted-foreground">
            Trackr would record{" "}
            <span className="font-medium text-foreground">{update}</span>
            {item.candidate
              ? ` on ${item.candidate.companyName} · ${item.candidate.jobTitle}.`
              : "."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Mail className="size-3.5" aria-hidden="true" />
            Email
          </p>
          <p className="truncate">
            <span className="font-medium">
              {email.senderName ?? email.senderEmail}
            </span>
            {email.senderName && email.senderEmail && (
              <span className="text-muted-foreground">
                {" "}
                · {email.senderEmail}
              </span>
            )}
          </p>
          {email.subject && <p className="font-medium">{email.subject}</p>}
          {email.evidence && (
            <blockquote className="border-l-2 pl-2 text-muted-foreground">
              “{email.evidence}”
            </blockquote>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-muted-foreground">
            <DateText date={email.receivedAt} />
            {email.confidence !== null && (
              <span>· {Math.round(email.confidence * 100)}% sure</span>
            )}
            <a
              href={`https://mail.google.com/mail/#all/${email.gmailMessageId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-text underline-offset-4 hover:underline"
            >
              Open in Gmail
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </p>
        </div>
        {item.candidate && (
          <ApplicationSummary
            label="Suggested application"
            application={item.candidate}
          />
        )}
      </div>

      {!item.candidate && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${item.id}-company`}>Company</Label>
            <Input
              id={`${item.id}-company`}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              aria-invalid={Boolean(errors.companyName)}
            />
            {errors.companyName && (
              <p className="text-destructive">{errors.companyName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${item.id}-role`}>Role</Label>
            <Input
              id={`${item.id}-role`}
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              aria-invalid={Boolean(errors.jobTitle)}
            />
            {errors.jobTitle && (
              <p className="text-destructive">{errors.jobTitle}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => dismissEmailReviewAction(item.id))}
        >
          <X aria-hidden="true" />
          Dismiss
        </Button>
        {item.candidate ? (
          <>
            {/* The suggestion may be wrong: a second application to the same company. */}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() =>
                  createApplicationFromEmailAction(item.id, {
                    companyName:
                      email.companyName ?? item.candidate!.companyName,
                    jobTitle: email.jobTitle ?? "Role not specified",
                  }),
                )
              }
            >
              <Plus aria-hidden="true" />
              Track as new application
            </Button>
            <Button
              disabled={pending}
              onClick={() => run(() => applyEmailReviewAction(item.id))}
            >
              <Check aria-hidden="true" />
              Apply update
            </Button>
          </>
        ) : (
          <Button
            disabled={pending}
            onClick={() =>
              run(() =>
                createApplicationFromEmailAction(item.id, {
                  companyName,
                  jobTitle,
                }),
              )
            }
          >
            <Plus aria-hidden="true" />
            Create application
          </Button>
        )}
      </div>
    </article>
  );
}
