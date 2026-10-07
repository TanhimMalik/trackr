import type { Application } from "@/server/db/types";
import type { ApplicationFormDefaults } from "./application-form";

/** The editable fields of an application, for prefilling the edit form. */
export function formDefaultsFor(
  application: Application,
): ApplicationFormDefaults {
  return {
    companyName: application.companyName,
    companyDomain: application.companyDomain,
    jobTitle: application.jobTitle,
    jobUrl: application.jobUrl,
    location: application.location,
    employmentType: application.employmentType,
    salaryMin: application.salaryMin,
    salaryMax: application.salaryMax,
    salaryCurrency: application.salaryCurrency,
    source: application.source,
    sourcePlatform: application.sourcePlatform,
    notes: application.notes,
  };
}
