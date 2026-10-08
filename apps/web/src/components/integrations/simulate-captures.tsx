"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { simulateCaptureAction } from "@/app/(app)/integrations/actions";
import { Button } from "@/components/ui/button";
import type { DemoCapture } from "@/server/demo/captures";

/**
 * Demo only: runs sample submissions through the real pipeline, so visitors
 * see what the extension does without installing it.
 */
export function SimulateCaptures({
  captures,
}: {
  captures: readonly Pick<DemoCapture, "id" | "title" | "description">[];
}) {
  return (
    <ul className="divide-y">
      {captures.map((capture) => (
        <CaptureRow key={capture.id} capture={capture} />
      ))}
    </ul>
  );
}

function CaptureRow({
  capture,
}: {
  capture: Pick<DemoCapture, "id" | "title" | "description">;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function simulate() {
    startTransition(async () => {
      const result = await simulateCaptureAction(capture.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message, {
        action: {
          label: result.outcome === "POSSIBLE_DUPLICATE" ? "Review" : "Open",
          onClick: () => router.push(result.href),
        },
        duration: 8000,
      });
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{capture.title}</p>
        <p className="truncate text-[0.8125rem] text-muted-foreground">
          {capture.description}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={simulate}>
        <Play aria-hidden="true" />
        {pending ? "Sending…" : "Simulate"}
      </Button>
    </li>
  );
}
