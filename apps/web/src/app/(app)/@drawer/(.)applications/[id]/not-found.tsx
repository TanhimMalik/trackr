import { ApplicationDrawer } from "@/components/applications/application-drawer";
import { ApplicationNotFound } from "@/components/applications/application-not-found";

export default function ApplicationDrawerNotFound() {
  return (
    <ApplicationDrawer>
      <ApplicationNotFound />
    </ApplicationDrawer>
  );
}
