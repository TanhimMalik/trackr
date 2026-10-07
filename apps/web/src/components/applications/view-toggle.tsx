"use client";

import { Columns3, Rows3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ApplicationsView = "board" | "table";

/** Switches between the board and the table, keeping filters in the URL. */
export function ViewToggle({ view }: { view: ApplicationsView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: string) {
    if (!next || next === view) return;
    const params = new URLSearchParams(searchParams);
    if (next === "table") params.set("view", "table");
    else params.delete("view");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={view}
      onValueChange={select}
      aria-label="View"
    >
      <ToggleGroupItem
        value="board"
        className="data-[state=on]:bg-primary-soft data-[state=on]:text-primary-text"
      >
        <Columns3 />
        Board
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        className="data-[state=on]:bg-primary-soft data-[state=on]:text-primary-text"
      >
        <Rows3 />
        Table
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
