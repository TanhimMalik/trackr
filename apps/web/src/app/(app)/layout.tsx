import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  /** Application details opened from a list, shown over the page. */
  drawer: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
      {drawer}
    </div>
  );
}
