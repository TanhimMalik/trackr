"use client";

import { useTheme } from "next-themes";
import { themeOptions } from "@/components/layout/theme-options";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMounted } from "@/hooks/use-mounted";

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Theme"
      // The stored theme is only known on the client; render unselected until then.
      value={mounted ? theme : undefined}
      onValueChange={(value) => value && setTheme(value)}
    >
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="data-[state=on]:bg-primary-soft data-[state=on]:text-primary-text"
        >
          <Icon />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
