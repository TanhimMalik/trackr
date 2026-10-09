import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncAllGmail } from "@/server/services/scheduled-sync";

// Vercel's limit for a function on the free plan.
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The daily Gmail sync, called by Vercel Cron with `CRON_SECRET` as a
 * bearer token. Without the secret configured, it refuses every request.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });
  const result = await syncAllGmail();
  console.info(JSON.stringify({ event: "scheduled_gmail_sync", ...result }));
  return NextResponse.json(result);
}
