"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authorizeExtensionAction } from "./actions";

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

/** Present on pages an installed extension allows to message it. */
function chromeRuntime(): ChromeRuntime | null {
  const chrome = (globalThis as { chrome?: { runtime?: ChromeRuntime } })
    .chrome;
  return typeof chrome?.runtime?.sendMessage === "function"
    ? chrome.runtime
    : null;
}

function sendCode(extensionId: string, code: string): Promise<boolean> {
  const runtime = chromeRuntime();
  if (!runtime) return Promise.resolve(false);
  return new Promise((resolve) => {
    runtime.sendMessage(
      extensionId,
      { type: "TRACKR_CONNECT", code },
      (response) => {
        resolve(
          !runtime.lastError &&
            (response as { ok?: boolean } | undefined)?.ok === true,
        );
      },
    );
  });
}

type State = "idle" | "connected" | "failed";

export function ConnectExtension({
  extensionId,
  account,
}: {
  extensionId: string;
  account: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [pending, startTransition] = useTransition();

  function authorize() {
    startTransition(async () => {
      const { code } = await authorizeExtensionAction();
      setState((await sendCode(extensionId, code)) ? "connected" : "failed");
    });
  }

  if (state === "connected") {
    return (
      <div className="space-y-2 text-center">
        <CircleCheck
          className="mx-auto size-8 text-success"
          aria-hidden="true"
        />
        <h1 className="text-lg font-semibold">Extension connected</h1>
        <p className="text-muted-foreground">
          Applications you submit on supported job sites will now appear in
          Trackr. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="text-lg font-semibold">Connect the Trackr extension</h1>
        <p className="text-muted-foreground">
          The extension will add applications you submit on Greenhouse, Lever
          and Ashby to{" "}
          <span className="font-medium text-foreground">{account}</span>. It
          can&apos;t read your email or your browsing history.
        </p>
      </div>
      {state === "failed" && (
        <p
          role="alert"
          className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          Couldn&apos;t reach the extension. Make sure it&apos;s installed in
          this browser, then open Connect account from its popup again.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button onClick={authorize} disabled={pending}>
          {pending ? "Connecting…" : "Authorize"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/integrations">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
