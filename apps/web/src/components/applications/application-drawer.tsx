"use client";

import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * The right-side drawer for an application opened from a list. Closing it
 * goes back, which returns to the board or table where it was opened.
 */
export function ApplicationDrawer({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Sheet open onOpenChange={(open) => !open && router.back()}>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[46rem]"
      >
        <SheetTitle className="sr-only">Application details</SheetTitle>
        <SheetDescription className="sr-only">
          Details and activity for this application.
        </SheetDescription>
        <div className="px-6 pt-6 pb-10">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
