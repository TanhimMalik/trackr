"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { setAutoTrackAction } from "@/app/(app)/settings/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Whether the extension records applications on supported job sites by itself. Saves on change. */
export function AutoTrackSetting({ initial }: { initial: boolean }) {
  const id = useId();
  const [enabled, setEnabled] = useState(initial);
  const [pending, startSaving] = useTransition();

  function save(next: boolean) {
    setEnabled(next);
    startSaving(async () => {
      const result = await setAutoTrackAction(next);
      if (result.ok) toast.success(result.message);
      else {
        setEnabled(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-medium">
          Track applications automatically
        </Label>
        <p className="text-muted-foreground">
          On Greenhouse, Lever and Ashby, the extension adds an application when
          you submit it. Turn this off to add jobs only from its popup.
        </p>
      </div>
      <Switch
        id={id}
        checked={enabled}
        disabled={pending}
        onCheckedChange={save}
      />
    </div>
  );
}
