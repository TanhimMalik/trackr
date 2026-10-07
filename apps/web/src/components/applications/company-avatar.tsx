"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const tile =
  "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border";

// Domains known to have no logo, shared by every avatar for the session so a
// missing logo is requested once rather than by every card that shows it.
const missingLogos = new Set<string>();

/**
 * A company's logo, served through Trackr's own logo route, with initials as
 * the fallback when there is no domain or no logo. Logos sit on a white tile
 * in both themes so dark marks stay visible.
 */
export function CompanyAvatar({
  name,
  domain,
  className,
}: {
  name: string;
  domain?: string | null;
  className?: string;
}) {
  const [failedDomain, setFailedDomain] = useState<string | null>(null);
  const markMissing = useCallback((missing: string) => {
    missingLogos.add(missing);
    setFailedDomain(missing);
  }, []);

  // Catches images that failed before React attached the error handler.
  const checkLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (domain && image?.complete && image.naturalWidth === 0) {
        markMissing(domain);
      }
    },
    [domain, markMissing],
  );

  if (!domain || failedDomain === domain || missingLogos.has(domain)) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          tile,
          "bg-muted text-xs font-semibold text-muted-foreground",
          className,
        )}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={cn(tile, "bg-white", className)}>
      <Image
        ref={checkLoaded}
        src={`/api/logos/${domain}`}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="size-full object-contain"
        onError={() => markMissing(domain)}
      />
    </span>
  );
}
