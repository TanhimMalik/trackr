import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationDetail } from "@/components/applications/application-detail";

export const metadata: Metadata = { title: "Application" };

/** The full page for an application, used for direct links and refreshes. */
export default async function ApplicationPage({
  params,
}: PageProps<"/applications/[id]">) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/applications"
        className="inline-flex w-fit items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Applications
      </Link>
      <ApplicationDetail applicationId={id} variant="page" />
    </div>
  );
}
