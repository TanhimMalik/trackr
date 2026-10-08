"use client";

import { Monitor, Unplug } from "lucide-react";
import { useState } from "react";
import { disconnectBrowserAction } from "@/app/(app)/integrations/actions";
import { DateText } from "@/components/date-text";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import type { ConnectedBrowser } from "@/server/services/extension-auth";

/** Browsers connected through the extension, each of which can be cut off. */
export function ConnectedBrowsers({
  browsers,
}: {
  browsers: ConnectedBrowser[];
}) {
  if (browsers.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-muted-foreground">
        No browsers connected. Install the Trackr extension and choose Connect
        account in its popup.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {browsers.map((browser) => (
        <BrowserRow key={browser.id} browser={browser} />
      ))}
    </ul>
  );
}

function BrowserRow({ browser }: { browser: ConnectedBrowser }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Monitor className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{browser.label}</p>
        <p className="truncate text-[0.8125rem] text-muted-foreground">
          Connected <DateText date={browser.createdAt} />
          {browser.lastUsedAt && (
            <>
              {" · Last used "}
              <DateText date={browser.lastUsedAt} relative />
            </>
          )}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Unplug aria-hidden="true" />
        Disconnect
      </Button>
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disconnect ${browser.label}?`}
        description="The extension in that browser stops adding applications right away. You can connect it again from its popup."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        onConfirm={() => disconnectBrowserAction(browser.id)}
      />
    </li>
  );
}
