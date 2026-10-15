"use client";

import {
  SENIORITY_LABELS,
  SKILL_EVIDENCE,
  SKILL_EVIDENCE_LABELS,
  WORK_MODE_LABELS,
  WORK_MODES,
  type FitPreferences,
  type ResumeProfile as Profile,
  type WorkMode,
} from "@trackr/domain";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteResumeProfileAction,
  updateFitPreferencesAction,
} from "@/app/(app)/settings/actions";
import { DateText } from "@/components/date-text";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseMoney } from "@/lib/applications/form-data";

export type ResumeProfileView = {
  profile: Profile;
  preferences: FitPreferences;
  sourceFilename: string | null;
  updatedAt: Date;
};

/** Picks a PDF and sends it to be read; the file isn't kept. */
function UploadButton({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function upload(file: File) {
    setReading(true);
    try {
      const body = new FormData();
      body.set("resume", file);
      const response = await fetch("/api/resume", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
      } | null;
      if (result?.ok) {
        toast.success(
          "Resume read. Applications with a job description are being scored.",
        );
        router.refresh();
      } else {
        toast.error(result?.error ?? "Couldn't upload that. Try again.");
      }
    } catch {
      toast.error("Couldn't reach Trackr. Try again.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        size="sm"
        variant={variant}
        disabled={reading}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" />
        {reading ? "Reading…" : label}
      </Button>
    </>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border bg-background px-1.5 py-0.5 text-xs"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Preferences({
  initial,
  disabled,
}: {
  initial: FitPreferences;
  disabled: boolean;
}) {
  const ids = { locations: useId(), workMode: useId(), salary: useId() };
  const [workMode, setWorkMode] = useState<WorkMode>(initial.workMode);
  const [saving, startSaving] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const salary = parseMoney(String(data.get("minSalary") ?? ""));
        startSaving(async () => {
          const result = await updateFitPreferencesAction({
            locations: String(data.get("locations") ?? ""),
            workMode,
            minSalary: salary,
          });
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={ids.locations}>Where you&apos;d work</Label>
        <Input
          id={ids.locations}
          name="locations"
          placeholder="Toronto, remote in Canada"
          defaultValue={initial.locations ?? ""}
          disabled={disabled}
          maxLength={200}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.workMode}>Work mode</Label>
        <Select
          value={workMode}
          onValueChange={(value) => setWorkMode(value as WorkMode)}
          disabled={disabled}
        >
          <SelectTrigger id={ids.workMode} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORK_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {WORK_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.salary}>Lowest salary you&apos;d take</Label>
        <Input
          id={ids.salary}
          name="minSalary"
          inputMode="numeric"
          placeholder="80k"
          defaultValue={initial.minSalary?.toLocaleString("en-US") ?? ""}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" disabled={disabled || saving}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The resume profile behind fit scores: upload a PDF, see what Claude read
 * from it, set preferences, or delete it.
 */
export function ResumeProfileSettings({
  record,
  isDemo,
  available,
}: {
  record: ResumeProfileView | null;
  isDemo: boolean;
  available: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!record) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {available
            ? "Upload your resume as a PDF. Claude reads it once; Trackr keeps the summary, not the file."
            : "Fit scoring isn't set up on this site."}
        </p>
        {available && !isDemo && <UploadButton label="Upload resume" />}
      </div>
    );
  }

  const { profile, preferences } = record;
  const bySource = SKILL_EVIDENCE.map((evidence) => ({
    evidence,
    names: profile.skills
      .filter((skill) => skill.evidence === evidence)
      .map((skill) => skill.name),
  })).filter((group) => group.names.length > 0);

  return (
    <div className="divide-y">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{profile.headline}</p>
            <p className="text-muted-foreground">
              {SENIORITY_LABELS[profile.seniority]}
              {profile.yearsExperience !== null &&
                ` · ${profile.yearsExperience} year${profile.yearsExperience === 1 ? "" : "s"} full-time`}
              {profile.education && ` · ${profile.education}`}
            </p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {isDemo ? (
                "A sample resume for this demo."
              ) : (
                <>
                  Read from {record.sourceFilename ?? "your resume"}{" "}
                  <DateText date={record.updatedAt} relative />
                </>
              )}
            </p>
          </div>
        </div>
        {!isDemo && (
          <div className="flex shrink-0 gap-2">
            {available && <UploadButton label="Replace" variant="outline" />}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {bySource.map(({ evidence, names }) => (
          <div key={evidence} className="space-y-1.5">
            <p className="text-[0.8125rem] font-medium">
              {SKILL_EVIDENCE_LABELS[evidence]}
              {evidence === "COURSE" && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · doesn&apos;t count toward fit
                </span>
              )}
            </p>
            <Chips items={names} />
          </div>
        ))}
        {profile.domains.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[0.8125rem] font-medium">Industries</p>
            <Chips items={profile.domains} />
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="space-y-0.5">
          <p className="font-medium">Your preferences</p>
          <p className="text-muted-foreground">
            Used for the location and pay part of each score. Anything left
            blank doesn&apos;t count against a job.
          </p>
        </div>
        <Preferences initial={preferences} disabled={isDemo} />
      </div>

      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your resume profile?"
        description="Trackr forgets what it read from your resume and every fit score made from it. Applications stay as they are."
        onConfirm={deleteResumeProfileAction}
      />
    </div>
  );
}
