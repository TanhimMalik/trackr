"use client";

import type { AutomationSettings } from "@trackr/domain";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmailAutomationAction } from "@/app/(app)/settings/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** How much Trackr may change on its own from email. Saves on change. */
export function EmailAutomationSettings({
  initial,
}: {
  initial: AutomationSettings;
}) {
  const autoId = useId();
  const askId = useId();
  const [settings, setSettings] = useState(initial);
  const [pending, startSaving] = useTransition();

  function save(next: AutomationSettings) {
    const previous = settings;
    setSettings(next);
    startSaving(async () => {
      const result = await setEmailAutomationAction(next);
      if (result.ok) toast.success(result.message);
      else {
        setSettings(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="divide-y">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor={autoId} className="font-medium">
            Update applications automatically
          </Label>
          <p className="text-muted-foreground">
            Clear confirmations, interview invites and rejections update the
            matching application, and you can undo any of them. Off: every
            update waits in Activity → Needs review.
          </p>
        </div>
        <Switch
          id={autoId}
          checked={settings.autoUpdateEnabled}
          disabled={pending}
          onCheckedChange={(autoUpdateEnabled) =>
            save({ ...settings, autoUpdateEnabled })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor={askId} className="font-medium">
            Ask before less certain updates
          </Label>
          <p className="text-muted-foreground">
            Only near-certain updates are applied on their own; the rest are
            asked about first.
          </p>
        </div>
        <Switch
          id={askId}
          checked={
            settings.autoUpdateEnabled && settings.askBeforeMediumConfidence
          }
          disabled={pending || !settings.autoUpdateEnabled}
          onCheckedChange={(askBeforeMediumConfidence) =>
            save({ ...settings, askBeforeMediumConfidence })
          }
        />
      </div>
    </div>
  );
}
