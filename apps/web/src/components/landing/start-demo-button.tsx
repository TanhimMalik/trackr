"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { startDemo, type StartDemoState } from "@/server/auth/demo";
import { cn } from "@/lib/utils";

/**
 * Starts a private demo workspace and opens it. With `autoStart`, it starts
 * as soon as the page loads (used by the shareable /demo link).
 */
export function StartDemoButton({
  label = "Try the live demo",
  size = "default",
  autoStart = false,
  className,
}: {
  label?: string;
  size?: "sm" | "default" | "lg";
  autoStart?: boolean;
  className?: string;
}) {
  const [state, action, pending] = useActionState<StartDemoState, FormData>(
    startDemo,
    null,
  );
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guarded so a remount (as in development) never starts two demos.
    if (!autoStart || started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, [autoStart]);

  return (
    <form
      ref={form}
      action={action}
      className={cn("flex flex-col items-center gap-2", className)}
    >
      <Button type="submit" size={size} disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Setting up your demo…
          </>
        ) : (
          <>
            {label}
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
      {state?.error && (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
