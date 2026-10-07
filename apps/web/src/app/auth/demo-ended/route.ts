import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/auth/supabase";

/**
 * Where a demo session goes once its workspace has expired: signs the demo
 * session out and returns to the landing page. Real accounts are left alone.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.isDemo) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  // A relative redirect keeps the host the visitor used.
  redirect("/?demo=ended");
}
