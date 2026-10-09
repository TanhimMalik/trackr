import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { exportUserData } from "@/server/services/privacy";

/** Downloads everything Trackr keeps about the signed-in user, as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const data = await exportUserData(user.id);
  const date = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="trackr-export-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
