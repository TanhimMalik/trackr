import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

/**
 * Persistent sidebar: hidden below 768px (navigation moves to a sheet),
 * a 56px icon rail from 768px, and the full 240px sidebar from 1280px.
 */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex md:w-14 xl:w-60">
      <div className="flex h-14 shrink-0 items-center px-4 md:justify-center md:px-0 xl:justify-start xl:px-4">
        <Logo collapsible />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3 xl:px-3">
        <SidebarNav collapsible />
      </div>
    </aside>
  );
}
