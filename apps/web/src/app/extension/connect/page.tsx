import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/layout/logo";
import { EXTENSION_ID_PATTERN } from "@/lib/extension/browser-label";
import { requireUser } from "@/server/auth/session";
import { ConnectExtension } from "./connect-extension";

export const metadata: Metadata = { title: "Connect extension" };

/**
 * Where the extension's "Connect account" button leads. Signing in happens
 * first if needed; authorizing hands the extension a one-time code.
 */
export default async function ConnectExtensionPage({
  searchParams,
}: PageProps<"/extension/connect">) {
  const user = await requireUser();
  const { ext } = await searchParams;
  const extensionId = typeof ext === "string" ? ext : "";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Link href="/overview" className="flex items-center gap-2">
        <LogoMark />
        <span className="text-base font-semibold tracking-tight">Trackr</span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6">
        {EXTENSION_ID_PATTERN.test(extensionId) ? (
          <ConnectExtension
            extensionId={extensionId}
            account={user.email ?? "your demo workspace"}
          />
        ) : (
          <div className="space-y-1.5 text-center">
            <h1 className="text-lg font-semibold">
              This link isn&apos;t complete
            </h1>
            <p className="text-muted-foreground">
              Open the Trackr extension and choose Connect account to start
              here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
