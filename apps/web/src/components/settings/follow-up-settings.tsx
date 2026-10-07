"use client";

import {
  FOLLOW_UP_AFTER_DAY_OPTIONS,
  INTERVIEW_FOLLOW_UP_AFTER_DAYS,
} from "@trackr/domain";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateFollowUpSettingsAction } from "@/app/(app)/settings/actions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FollowUpSettings as Settings } from "@/server/services/settings";

/** Turns follow-up reminders on or off and sets how long to wait. Saves on change. */
export function FollowUpSettings({ initial }: { initial: Settings }) {
  const switchId = useId();
  const daysId = useId();
  const [settings, setSettings] = useState(initial);
  const [pending, startSaving] = useTransition();

  function save(next: Settings) {
    const previous = settings;
    setSettings(next);
    startSaving(async () => {
      const result = await updateFollowUpSettingsAction(next);
      if (result.ok) {
        toast.success(result.message);
      } else {
        setSettings(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="divide-y">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor={switchId} className="font-medium">
            Remind me to follow up
          </Label>
          <p className="text-muted-foreground">
            Applications with no reply, and interviews with no news{" "}
            {INTERVIEW_FOLLOW_UP_AFTER_DAYS} days later. Trackr never emails
            anyone for you.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={settings.enabled}
          disabled={pending}
          onCheckedChange={(enabled) => save({ ...settings, enabled })}
        />
      </div>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Label
          htmlFor={daysId}
          className={settings.enabled ? undefined : "text-muted-foreground"}
        >
          Wait after applying
        </Label>
        <Select
          value={String(settings.afterDays)}
          disabled={pending || !settings.enabled}
          onValueChange={(value) =>
            save({ ...settings, afterDays: Number(value) })
          }
        >
          <SelectTrigger id={daysId} className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLLOW_UP_AFTER_DAY_OPTIONS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
