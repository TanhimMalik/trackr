import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DemoBanner } from "@/components/layout/demo-banner";
import { requireUser } from "@/server/auth/session";
import { DEMO_LIFETIME_HOURS } from "@/server/services/demo-workspace";
import { userExists } from "@/server/services/users";

export default async function AppLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  /** Application details opened from a list, shown over the page. */
  drawer: React.ReactNode;
}) {
  const user = await requireUser();
  // An expired demo's workspace is gone even if its session is still valid.
  if (user.isDemo && !(await userExists(user.id))) {
    redirect("/auth/demo-ended");
  }

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.isDemo && <DemoBanner lifetimeHours={DEMO_LIFETIME_HOURS} />}
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
      {drawer}
    </div>
  );
}
