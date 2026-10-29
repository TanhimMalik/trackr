"use client";

import {
  isChoosable,
  keptByDefault,
  orderedByFit,
  toClose,
  toSave,
  type ChoosableItem,
} from "@trackr/domain";
import { Globe, ListFilter, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { simulateTriageSaveAction } from "@/app/(app)/integrations/actions";
import { FitBadge } from "@/components/applications/fit-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type SampleTab = { id: string; title: string; site: string };

export type SampleTriageItem = ChoosableItem & {
  companyName: string;
  jobTitle: string;
  fit: { score: number; summary: string };
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Demo only: the extension's tab triage on a pretend browser window. The
 * sample postings were scored ahead of time against the demo's resume;
 * saving runs through the same pipeline the extension uses.
 */
export function SimulateTriage({
  tabs,
  items: scored,
}: {
  tabs: SampleTab[];
  items: SampleTriageItem[];
}) {
  const router = useRouter();
  const [triaged, setTriaged] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const items = scored.map((item) => ({
    ...item,
    closed: closed.has(item.key),
  }));
  const [kept, setKept] = useState(() => keptByDefault(items));
  const [confirming, setConfirming] = useState(false);
  const [saving, startSaving] = useTransition();

  const openTabs = tabs.filter((tab) => !closed.has(tab.id));
  const unreadable = tabs.length - scored.length;
  const saveList = toSave(items, kept);
  const closeList = toClose(items, kept);

  function toggle(key: string, keep: boolean) {
    const next = new Set(kept);
    if (keep) next.add(key);
    else next.delete(key);
    setKept(next);
    setConfirming(false);
  }

  function save() {
    startSaving(async () => {
      const result = await simulateTriageSaveAction(
        saveList.map((item) => item.key),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message, {
        action: {
          label: "Open",
          onClick: () => router.push("/applications?status=SAVED&sort=fit"),
        },
        duration: 8000,
      });
      router.refresh();
    });
  }

  function close() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setClosed(new Set([...closed, ...closeList.map((item) => item.key)]));
    toast.success(`Closed ${plural(closeList.length, "tab")}.`);
  }

  function reset() {
    setTriaged(false);
    setClosed(new Set());
    setKept(keptByDefault(scored));
    setConfirming(false);
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-2">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">
          Tabs open in this window
        </p>
        <ul className="divide-y rounded-lg border bg-background">
          {openTabs.map((tab) => (
            <li key={tab.id} className="flex items-center gap-2.5 px-3 py-2">
              <Globe
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-[0.8125rem]">{tab.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tab.site}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          {!triaged ? (
            // Keyed apart, so the swap isn't animated as one button changing.
            <Button key="triage" size="sm" onClick={() => setTriaged(true)}>
              <ListFilter aria-hidden="true" />
              Triage these {openTabs.length} tabs
            </Button>
          ) : (
            <Button key="reset" size="sm" variant="ghost" onClick={reset}>
              Start over
            </Button>
          )}
        </div>
      </div>

      {triaged ? (
        <div className="space-y-3">
          <p>
            {plural(scored.length, "job post")},{" "}
            {scored.filter((item) => item.fit.score >= 75).length} strong fits.
            Strong fits are kept; untick any you&apos;d rather close.
            {unreadable > 0 &&
              ` ${plural(unreadable, "tab")} ${unreadable === 1 ? "wasn't a job post" : "weren't job posts"} Trackr can read.`}
          </p>
          <ul className="divide-y rounded-lg border">
            {orderedByFit(items).map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5",
                  item.closed && "opacity-55",
                )}
              >
                {isChoosable(item) ? (
                  <Checkbox
                    className="mt-0.5"
                    checked={kept.has(item.key)}
                    onCheckedChange={(value) =>
                      toggle(item.key, value === true)
                    }
                    aria-label={`Keep ${item.companyName}, ${item.jobTitle}`}
                  />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{item.companyName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.jobTitle}
                    </span>
                  </p>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    {item.fit.summary}
                  </p>
                </div>
                {item.applicationId ? (
                  <Link
                    href={`/applications/${item.applicationId}`}
                    className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium text-primary-text"
                  >
                    In Trackr
                  </Link>
                ) : item.closed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
                    <X className="size-3" aria-hidden="true" />
                    Closed
                  </span>
                ) : (
                  <FitBadge score={item.fit.score} />
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={saveList.length === 0 || saving}
              onClick={save}
            >
              {saving
                ? "Saving…"
                : saveList.length > 0
                  ? `Save ${saveList.length} to Trackr`
                  : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={closeList.length === 0 || saving}
              onClick={close}
            >
              {confirming
                ? `Close ${plural(closeList.length, "tab")}?`
                : closeList.length > 0
                  ? `Close ${closeList.length} other${closeList.length === 1 ? "" : "s"}`
                  : "Close"}
            </Button>
          </div>
          <p className="text-[0.8125rem] text-muted-foreground">
            These scores were worked out ahead of time against the demo&apos;s
            sample resume. In the extension, Claude scores each posting as you
            triage.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          Triage reads each tab, scores the job posts against your resume, and
          offers to save the best and close the rest.
        </div>
      )}
    </div>
  );
}
