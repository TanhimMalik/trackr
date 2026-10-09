"use client";

import { ChevronRight, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { simulateEmailAction } from "@/app/(app)/integrations/actions";
import { Button } from "@/components/ui/button";
import type { DemoEmail } from "@/server/demo/emails";

export type SimulatedEmail = Pick<
  DemoEmail,
  "id" | "fromName" | "subject" | "body" | "expect"
>;

/**
 * Demo only: a sample inbox whose emails go through the same pipeline as
 * Gmail sync, so visitors see what Trackr does with each kind of email.
 */
export function SimulateEmails({
  emails,
}: {
  emails: readonly SimulatedEmail[];
}) {
  return (
    <ul className="divide-y">
      {emails.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
    </ul>
  );
}

function EmailRow({ email }: { email: SimulatedEmail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function deliver() {
    startTransition(async () => {
      const result = await simulateEmailAction(email.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { href } = result;
      toast.success(result.message, {
        action: href
          ? {
              label: href.startsWith("/activity") ? "Review" : "Open",
              onClick: () => router.push(href),
            }
          : undefined,
        duration: 8000,
      });
    });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <details className="group/email min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-open/email:rotate-90"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate">
              <span className="font-medium">{email.fromName}</span>
              <span className="text-muted-foreground"> · {email.subject}</span>
            </span>
            <span className="block text-[0.8125rem] text-muted-foreground">
              {email.expect}
            </span>
          </span>
        </summary>
        <div className="mt-2 ml-5 space-y-2 rounded-md border bg-muted/40 p-3 text-[0.8125rem] whitespace-pre-line">
          {email.body}
        </div>
      </details>
      <Button variant="outline" size="sm" disabled={pending} onClick={deliver}>
        <Send aria-hidden="true" />
        {pending ? "Reading…" : "Deliver"}
      </Button>
    </li>
  );
}
