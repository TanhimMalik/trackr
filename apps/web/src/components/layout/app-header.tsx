import type { SessionUser } from "@/server/auth/session";
import { LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <MobileNav />
      <LogoMark className="md:hidden" />
      <div className="flex-1" />
      <UserMenu user={{ name: user.name, email: user.email }} />
    </header>
  );
}
