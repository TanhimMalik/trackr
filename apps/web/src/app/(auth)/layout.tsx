import Link from "next/link";
import { LogoMark } from "@/components/layout/logo";
import { DEMO_PATH } from "@/lib/auth/routes";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="flex items-center justify-center gap-2">
          <LogoMark />
          <span className="text-base font-semibold tracking-tight">Trackr</span>
        </Link>
        <div className="rounded-xl border bg-card p-6">{children}</div>
        <p className="text-center text-[0.8125rem] text-muted-foreground">
          Just looking around?{" "}
          <Link
            href={DEMO_PATH}
            prefetch={false}
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Try the demo
          </Link>
        </p>
      </div>
    </div>
  );
}
