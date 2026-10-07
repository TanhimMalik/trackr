import { ApplicationDrawer } from "@/components/applications/application-drawer";
import { ApplicationDetailSkeleton } from "@/components/applications/application-detail-skeleton";

export default function ApplicationDrawerLoading() {
  return (
    <ApplicationDrawer>
      <ApplicationDetailSkeleton />
    </ApplicationDrawer>
  );
}
