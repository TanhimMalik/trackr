import type { SessionUser } from "@/server/auth/session";
import { CommandPalette } from "./command-palette";
import { LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NotificationCenter } from "./notification-center";
import { UserMenu } from "./user-menu";

export function AppHeader({
  user,
  unreadNotifications,
}: {
  user: SessionUser;
  unreadNotifications: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <MobileNav />
      <LogoMark className="md:hidden" />
      {/* Search sits on the left from medium screens, beside the menu on phones. */}
      <div className="max-md:ml-auto">
        <CommandPalette />
      </div>
      <div className="hidden flex-1 md:block" />
      <NotificationCenter unreadCount={unreadNotifications} />
      <UserMenu
        user={{ name: user.name, email: user.email, isDemo: user.isDemo }}
      />
    </header>
  );
}
