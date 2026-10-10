import { ApplicationDrawer } from "@/components/applications/application-drawer";
import { ApplicationNotFound } from "@/components/applications/application-not-found";

export default function ApplicationDrawerNotFound() {
  return (
    <ApplicationDrawer>
      <div className="pt-6">
        <ApplicationNotFound />
      </div>
    </ApplicationDrawer>
  );
}
