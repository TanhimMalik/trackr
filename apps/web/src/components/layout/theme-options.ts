import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

export type ThemeOption = {
  value: "light" | "dark" | "system";
  label: string;
  icon: LucideIcon;
};

export const themeOptions: ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
