"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { scoreFitAction } from "@/app/(app)/applications/detail-actions";
import { Button } from "@/components/ui/button";

/** Scores the job against the resume profile now, or again. */
export function ScoreFitButton({
  applicationId,
  rescore = false,
}: {
  applicationId: string;
  rescore?: boolean;
}) {
  const router = useRouter();
  const [scoring, startScoring] = useTransition();
  const Icon = rescore ? RefreshCw : Sparkles;
  return (
    <Button
      size="sm"
      variant={rescore ? "outline" : "default"}
      disabled={scoring}
      onClick={() =>
        startScoring(async () => {
          const result = await scoreFitAction(applicationId);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <Icon
        className={scoring ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      {scoring ? "Scoring…" : rescore ? "Score again" : "Score fit"}
    </Button>
  );
}
