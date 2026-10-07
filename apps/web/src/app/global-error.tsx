"use client";

import "./globals.css";

/** Last resort when the root layout itself fails; it replaces the whole page. */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold">Trackr is having trouble</h1>
        <p className="max-w-sm text-muted-foreground">
          Something went wrong while loading. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
