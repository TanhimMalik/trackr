import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { fetchCompanyLogo, isLogoDomain } from "@/server/integrations/logos";

const WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Serves a company's logo for signed-in users. Logos are fetched server-side
 * and cached, and only raster images are passed through.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/logos/[domain]">,
) {
  if (!(await getCurrentUser())) {
    return new NextResponse(null, { status: 401 });
  }

  const { domain } = await context.params;
  if (!isLogoDomain(domain)) return new NextResponse(null, { status: 400 });

  const logo = await fetchCompanyLogo(domain);
  if (!logo) {
    return new NextResponse(null, {
      status: 404,
      headers: { "cache-control": "private, max-age=86400" },
    });
  }

  return new NextResponse(logo.body, {
    headers: {
      "content-type": logo.contentType,
      "cache-control": `private, max-age=${WEEK_SECONDS}`,
      "x-content-type-options": "nosniff",
    },
  });
}
