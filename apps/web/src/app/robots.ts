import type { MetadataRoute } from "next";

/** Only the landing page is meant for search engines; the app is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/$",
      disallow: "/",
    },
  };
}
