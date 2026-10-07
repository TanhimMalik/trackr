import type { BoardApplication } from "@/server/services/applications";
import type { BoardItem } from "./application-card";
import { formDefaultsFor } from "./form-defaults";

/** What the board needs from an application read model. */
export function toBoardItem(application: BoardApplication): BoardItem {
  return {
    id: application.id,
    companyName: application.companyName,
    companyDomain: application.companyDomain,
    jobTitle: application.jobTitle,
    status: application.currentStatus,
    appliedAt: application.appliedAt,
    createdAt: application.createdAt,
    signal: application.signal,
    defaults: formDefaultsFor(application),
  };
}
