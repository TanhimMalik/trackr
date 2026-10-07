import type { Metadata } from "next";
import Link from "next/link";
import { StartDemoButton } from "@/components/landing/start-demo-button";
import { LogoMark } from "@/components/layout/logo";

export const metadata: Metadata = { title: "Demo" };

/**
 * A shareable link straight into a demo workspace. The demo starts from the
 * browser rather than on the request itself, so link previews and crawlers
 * never create one.
 */
export default function DemoPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="text-base font-semibold tracking-tight">Trackr</span>
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Opening the demo</h1>
        <p className="max-w-sm text-muted-foreground">
          A private workspace with sample data, just for you. No sign-up needed.
        </p>
      </div>
      <StartDemoButton autoStart label="Open the demo" />
      <Link
        href="/"
        className="text-[0.8125rem] text-muted-foreground underline-offset-4 hover:underline"
      >
        Learn about Trackr first
      </Link>
    </div>
  );
}
