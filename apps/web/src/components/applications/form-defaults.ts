import { PLACEHOLDER_JOB_TITLE } from "@trackr/domain";
import type { Application } from "@/server/db/types";
import type { ApplicationFormDefaults } from "./application-form";

/**
 * The editable fields of an application, for prefilling the edit form. A
 * role Gmail couldn't name starts blank, ready to be filled in. Lists leave
 * out the description, which can be long; their edit form then leaves it
 * as it is.
 */
export function formDefaultsFor(
  application: Application,
  { description = true }: { description?: boolean } = {},
): ApplicationFormDefaults {
  return {
    companyName: application.companyName,
    companyDomain: application.companyDomain,
    jobTitle:
      application.jobTitle === PLACEHOLDER_JOB_TITLE
        ? ""
        : application.jobTitle,
    jobUrl: application.jobUrl,
    location: application.location,
    employmentType: application.employmentType,
    salaryMin: application.salaryMin,
    salaryMax: application.salaryMax,
    salaryCurrency: application.salaryCurrency,
    source: application.source,
    sourcePlatform: application.sourcePlatform,
    ...(description ? { jobDescription: application.jobDescription } : {}),
    notes: application.notes,
  };
}
