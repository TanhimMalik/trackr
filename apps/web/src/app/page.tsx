import {
  ChartNoAxesColumn,
  History,
  Mail,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { StartDemoButton } from "@/components/landing/start-demo-button";
import { ProductPreview } from "@/components/landing/product-preview";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Trackr · Your job search, tracked for you" },
};

const FEATURES: {
  icon: LucideIcon;
  title: string;
  description: string;
  inProgress?: boolean;
}[] = [
  {
    icon: Puzzle,
    title: "Captured as you apply",
    description:
      "The browser extension records the job when you submit an application on Greenhouse, Lever or Ashby.",
    inProgress: true,
  },
  {
    icon: Mail,
    title: "Kept current from Gmail",
    description:
      "Confirmations, assessments, interviews and rejections update the status. Rules come first; a language model only steps in when they can't decide.",
    inProgress: true,
  },
  {
    icon: History,
    title: "Every change explained",
    description:
      "Each update records where it came from and how confident Trackr was, in a timeline you can check. You can always correct a status yourself.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Know where you stand",
    description:
      "Response rate, interviews and offers at a glance, a funnel by period, and a board of everything still in progress.",
  },
];

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  // The preview's dates are relative to today.
  await connection();
  const { demo, account } = await searchParams;
  const notice =
    demo === "ended"
      ? "Your demo workspace has ended. Start a new one any time."
      : account === "deleted"
        ? "Your account and everything in it were deleted."
        : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark />
          <span className="text-base font-semibold tracking-tight">Trackr</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-14 pb-12 text-center md:pt-20">
          {notice && (
            <p
              role="status"
              className="mx-auto mb-8 w-fit rounded-lg border bg-muted/60 px-3 py-1.5 text-[0.8125rem] text-muted-foreground"
            >
              {notice}
            </p>
          )}
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
            Your job search, tracked for you.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-muted-foreground">
            Trackr records applications as you submit them and keeps each one up
            to date from your inbox, from the confirmation to the offer, with
            every change explained.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-start">
            <StartDemoButton size="lg" />
            <Button variant="outline" size="lg" asChild>
              <Link href="/signup">Create an account</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No sign-up needed. The demo opens a private workspace with sample
            data.
          </p>
        </section>

        <section
          aria-label="Product preview"
          className="mx-auto max-w-6xl px-4 md:px-6"
        >
          <ProductPreview now={new Date()} />
        </section>

        <section
          aria-labelledby="features-heading"
          className="mx-auto max-w-6xl px-4 py-16 md:px-6"
        >
          <h2 id="features-heading" className="sr-only">
            Features
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description, inProgress }) => (
              <li key={title} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {inProgress && (
                    <span className="rounded-md border px-1.5 text-xs leading-5 text-muted-foreground">
                      In progress
                    </span>
                  )}
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p>Built with Next.js, TypeScript, Postgres and Supabase.</p>
          <p>
            Applications and history are stored per account and never shared.
          </p>
        </div>
      </footer>
    </div>
  );
}
