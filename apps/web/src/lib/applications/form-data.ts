/**
 * Converts the application form's fields into input for the application
 * schemas. Shared by the form (client) and its server actions.
 */

/** Select value meaning "no choice"; Radix selects cannot use an empty string. */
export const NO_SELECTION = "none";

export function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/** Blank text and the no-selection value become null; absent fields stay undefined. */
export function optional(
  formData: FormData,
  name: string,
): string | null | undefined {
  const value = text(formData, name);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === NO_SELECTION ? null : trimmed;
}

/**
 * Parses salaries written the way people type them: "150000", "150,000",
 * "$150,000" or "150k". Anything else is returned as NaN so validation
 * reports it.
 */
export function parseMoney(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[\s,$_]/g, "");
  if (cleaned === "") return null;
  const thousands = /^(\d+(?:\.\d+)?)k$/i.exec(cleaned);
  if (thousands) return Math.round(Number(thousands[1]) * 1000);
  return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

export function applicationFormValues(formData: FormData) {
  const salaryMin = parseMoney(text(formData, "salaryMin"));
  const salaryMax = parseMoney(text(formData, "salaryMax"));
  const hasSalary = salaryMin !== null || salaryMax !== null;

  return {
    companyName: text(formData, "companyName") ?? "",
    companyWebsite: optional(formData, "companyWebsite"),
    jobTitle: text(formData, "jobTitle") ?? "",
    jobUrl: optional(formData, "jobUrl"),
    location: optional(formData, "location"),
    employmentType: optional(formData, "employmentType"),
    salaryMin,
    salaryMax,
    // A currency only means something alongside a salary.
    salaryCurrency: hasSalary ? optional(formData, "salaryCurrency") : null,
    source: optional(formData, "source"),
    sourcePlatform: optional(formData, "sourcePlatform"),
    notes: optional(formData, "notes"),
    // Only present on the create form.
    status: optional(formData, "status") ?? undefined,
    appliedAt: optional(formData, "appliedAt") ?? undefined,
  };
}

/** "YYYY-MM-DD" for a date in the browser's local time zone. */
export function localDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Converts a date picked in a date input into a timestamp. Today means "now";
 * other days are anchored at local noon so the date reads the same in any
 * nearby time zone.
 */
export function appliedDateToIso(
  value: string | null | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!value) return undefined;
  if (value === localDateInputValue(now)) return now.toISOString();
  const noon = new Date(`${value}T12:00:00`);
  return Number.isNaN(noon.getTime()) ? undefined : noon.toISOString();
}
