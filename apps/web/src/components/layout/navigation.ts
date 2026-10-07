import { FileText, House, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// Sections are added here as they are implemented, so navigation never links to an unfinished page.
export const navigation: NavItem[] = [
  { href: "/overview", label: "Overview", icon: House },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
