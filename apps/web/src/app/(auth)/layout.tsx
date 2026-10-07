import { LogoMark } from "@/components/layout/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <LogoMark />
          <span className="text-base font-semibold tracking-tight">Trackr</span>
        </div>
        <div className="rounded-xl border bg-card p-6">{children}</div>
      </div>
    </div>
  );
}
