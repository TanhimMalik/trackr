import { ApplicationDetail } from "@/components/applications/application-detail";
import { ApplicationDrawer } from "@/components/applications/application-drawer";

/** An application opened from the board or table, shown over the list. */
export default async function ApplicationDrawerPage({
  params,
}: PageProps<"/applications/[id]">) {
  const { id } = await params;
  return (
    <ApplicationDrawer>
      <ApplicationDetail applicationId={id} variant="drawer" />
    </ApplicationDrawer>
  );
}
