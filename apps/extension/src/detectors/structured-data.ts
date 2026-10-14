import { plainTextDescription } from "@trackr/domain";

/** The parts of a schema.org JobPosting the extension uses. */
export type StructuredJob = {
  title: string | null;
  companyName: string | null;
  location: string | null;
  identifier: string | null;
  /** Plain text; postings give it as HTML. */
  description: string | null;
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function* nodes(value: unknown): Generator<Json> {
  if (Array.isArray(value)) {
    for (const item of value) yield* nodes(item);
  } else if (isObject(value)) {
    yield value;
    if (Array.isArray(value["@graph"])) yield* nodes(value["@graph"]);
  }
}

function isJobPosting(node: Json): boolean {
  const type = node["@type"];
  return Array.isArray(type)
    ? type.includes("JobPosting")
    : type === "JobPosting";
}

function placeName(place: unknown): string | null {
  if (!isObject(place)) return null;
  const address = place.address;
  if (typeof address === "string") return text(address);
  if (!isObject(address)) return text(place.name);
  const parts = [address.addressLocality, address.addressRegion]
    .map(text)
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : text(address.addressCountry);
}

function locationOf(node: Json): string | null {
  const places = Array.isArray(node.jobLocation)
    ? node.jobLocation
    : [node.jobLocation];
  const names = [
    ...new Set(
      places.map(placeName).filter((name): name is string => name !== null),
    ),
  ];
  if (names.length > 0) return names.join("; ");
  return node.jobLocationType === "TELECOMMUTE" ? "Remote" : null;
}

/** The first schema.org JobPosting in a set of JSON-LD blocks. */
export function structuredJobFromJson(blocks: string[]): StructuredJob | null {
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }
    for (const node of nodes(data)) {
      if (!isJobPosting(node)) continue;
      const organization = node.hiringOrganization;
      const identifier = node.identifier;
      const description = text(node.description);
      return {
        title: text(node.title),
        companyName: isObject(organization)
          ? text(organization.name)
          : text(organization),
        location: locationOf(node),
        identifier: isObject(identifier)
          ? text(identifier.value)
          : text(identifier),
        description: description
          ? plainTextDescription(description) || null
          : null,
      };
    }
  }
  return null;
}

/** Reads the first schema.org JobPosting embedded in the page as JSON-LD. */
export function findStructuredJob(document: Document): StructuredJob | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  return structuredJobFromJson(
    [...scripts].map((script) => script.textContent ?? ""),
  );
}

/** The job description in the first matching element, as plain text. */
export function descriptionOf(
  document: Document,
  selectors: string[],
): string | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const description = element ? plainTextDescription(element.innerHTML) : "";
    if (description.length >= 40) return description;
  }
  return null;
}

/** The content of a `<meta property="…">` or `<meta name="…">` tag. */
export function metaContent(document: Document, key: string): string | null {
  const element = document.querySelector<HTMLMetaElement>(
    `meta[property="${key}"], meta[name="${key}"]`,
  );
  return text(element?.content);
}

/** Trimmed, whitespace-collapsed text of the first matching element. */
export function textOf(document: Document, selector: string): string | null {
  const value = document.querySelector(selector)?.textContent;
  return value ? text(value.replace(/\s+/g, " ")) : null;
}

/** "acme-corp" → "Acme Corp", for when a page names the company nowhere else. */
export function companyFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

const HIDDEN = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

/** The page's readable text, leaving out scripts and styles. */
export function visibleText(root: Element | null): string {
  if (!root) return "";
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.textContent ?? "");
    else if (node.nodeType === 1 && !HIDDEN.has((node as Element).tagName)) {
      node.childNodes.forEach(walk);
    }
  };
  walk(root);
  return parts.join(" ").replace(/\s+/g, " ");
}
