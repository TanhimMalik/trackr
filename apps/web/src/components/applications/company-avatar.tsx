"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const tile =
  "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border";

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

  // Catches images that failed before React attached the error handler.
  const checkLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (domain && image?.complete && image.naturalWidth === 0) {
        setFailedDomain(domain);
      }
    },
    [domain],
  );

  if (!domain || failedDomain === domain) {
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
        onError={() => setFailedDomain(domain)}
      />
    </span>
  );
}
