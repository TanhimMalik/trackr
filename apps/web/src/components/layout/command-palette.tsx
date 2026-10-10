"use client";

import { Plus, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { listApplicationSummariesAction } from "@/app/(app)/applications/actions";
import { AddApplicationDialog } from "@/components/applications/application-dialogs";
import { CompanyAvatar } from "@/components/applications/company-avatar";
import { StatusBadge } from "@/components/applications/status-badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  applicationKeywords,
  applicationValue,
  isPaletteShortcut,
  matchScore,
  paletteFilter,
} from "@/lib/command-palette";
import type { ApplicationSummary } from "@/server/services/applications";
import { navigation } from "./navigation";
import { themeOptions } from "./theme-options";

/** Shown before anything is typed. */
const RECENT_COUNT = 5;
const ADD_KEYWORDS = ["new", "create", "track"];
const THEME_KEYWORDS = ["mode"];

const subscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere, nothing during server rendering. */
function useShortcutLabel(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (isMac() ? "⌘K" : "Ctrl K"),
    () => null,
  );
}

/**
 * The ⌘K palette: find an application by company, role, location or status,
 * jump to a page, add an application or switch the theme.
 */
export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const shortcut = useShortcutLabel();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [applications, setApplications] = useState<ApplicationSummary[] | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [loading, startLoading] = useTransition();
  const [adding, setAdding] = useState(false);

  // Opening shows what was loaded last time right away and refreshes it.
  function openPalette() {
    setSearch("");
    setSelected("");
    setOpen(true);
    startLoading(async () => {
      try {
        const summaries = await listApplicationSummariesAction();
        setApplications(summaries);
        // On the first open the list arrives after the palette has picked
        // its first item; start on the latest application instead, unless
        // the selection has already moved.
        const latest = summaries[0];
        if (latest) {
          setSelected((current) =>
            current === "" || current === navigation[0]?.label
              ? applicationValue(latest.id)
              : current,
          );
        }
      } catch {
        setApplications((current) => current ?? []);
      }
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      if (open) setOpen(false);
      else openPalette();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const searching = search.trim() !== "";
  const shown = searching
    ? (applications ?? [])
    : (applications ?? []).slice(0, RECENT_COUNT);
  const best = (candidates: string[][]) =>
    Math.max(0, ...candidates.map((fields) => matchScore(search, fields)));

  const sections = [
    {
      id: "applications",
      score: best(shown.map(applicationKeywords)),
      content: shown.length > 0 && (
        <CommandGroup heading={searching ? "Applications" : "Recent"}>
          {shown.map((application) => (
            <CommandItem
              key={application.id}
              value={applicationValue(application.id)}
              keywords={applicationKeywords(application)}
              onSelect={() =>
                run(() => router.push(`/applications/${application.id}`))
              }
              // The item's built-in check mark has no use here.
              className="gap-3 py-2 [&>svg:last-child]:hidden"
            >
              <CompanyAvatar
                name={application.companyName}
                domain={application.companyDomain}
                className="size-7"
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{application.companyName}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {application.jobTitle}
                </span>
              </span>
              <StatusBadge
                status={application.currentStatus}
                className="shrink-0 text-xs"
              />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    },
    {
      id: "go-to",
      score: best(navigation.map(({ label }) => [label])),
      content: (
        <CommandGroup heading="Go to">
          {navigation.map(({ href, label, icon: Icon }) => (
            <CommandItem
              key={href}
              value={label}
              onSelect={() => run(() => router.push(href))}
            >
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    },
    {
      id: "actions",
      score: best([["Add application", ...ADD_KEYWORDS]]),
      content: (
        <CommandGroup heading="Actions">
          <CommandItem
            value="Add application"
            keywords={ADD_KEYWORDS}
            onSelect={() => run(() => setAdding(true))}
          >
            <Plus />
            Add application
          </CommandItem>
        </CommandGroup>
      ),
    },
    {
      id: "theme",
      score: best(
        themeOptions.map(({ label }) => [`${label} theme`, ...THEME_KEYWORDS]),
      ),
      content: (
        <CommandGroup heading="Theme">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <CommandItem
              key={value}
              value={`${label} theme`}
              keywords={THEME_KEYWORDS}
              data-checked={theme === value}
              onSelect={() => run(() => setTheme(value))}
            >
              <Icon />
              {label} theme
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    },
  ];
  // cmdk ranks the items inside each group but not the groups themselves,
  // so while searching the group with the best match goes first.
  const ordered = searching
    ? [...sections].sort((a, b) => b.score - a.score)
    : sections;

  return (
    <>
      <Button
        variant="outline"
        onClick={openPalette}
        aria-keyshortcuts="Meta+K Control+K"
        className="size-9 justify-start gap-2 px-0 font-normal text-muted-foreground max-md:justify-center md:w-72 md:px-2.5"
      >
        <Search />
        <span className="sr-only md:not-sr-only">
          Search applications, pages…
        </span>
        {shortcut && (
          <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-sans text-[0.6875rem] leading-5 font-medium md:inline">
            {shortcut}
          </kbd>
        )}
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Find an application, go to a page or run an action."
        className="sm:max-w-xl"
      >
        <Command
          filter={paletteFilter}
          loop
          value={selected}
          onValueChange={setSelected}
        >
          <CommandInput
            aria-label="Search applications, pages and actions"
            placeholder="Search applications, pages and actions…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[min(24rem,60dvh)]">
            <CommandEmpty>
              {loading && applications === null
                ? "Loading applications…"
                : "No results."}
            </CommandEmpty>

            {applications === null && loading && !searching && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Loading recent applications…
              </p>
            )}

            {ordered.map((section) => (
              <Fragment key={section.id}>{section.content}</Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>

      <AddApplicationDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
