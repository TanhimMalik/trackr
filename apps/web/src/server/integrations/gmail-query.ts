/** Senders worth searching for even when a message's words wouldn't match. */
export const ATS_SEARCH_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "ashbyhq.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "jobvite.com",
];

const TERMS = [
  "application",
  "applied",
  "applying",
  "interview",
  "candidate",
  "candidacy",
  "assessment",
  "offer",
  "recruiter",
  "recruiting",
  "position",
  "role",
  '"next steps"',
  '"thank you for applying"',
];

/**
 * A coarse Gmail search for the first sync: recent mail that mentions
 * applications or comes from an ATS, leaving out spam, chats, social and
 * forum mail. It only saves work; the relevance filter makes the decision.
 */
export function backfillQuery(
  afterEpochSeconds: number,
  domains: readonly string[],
): string {
  const anyOf = [...domains.map((domain) => `from:${domain}`), ...TERMS].join(
    " ",
  );
  return [
    `after:${afterEpochSeconds}`,
    "-in:chats",
    "-in:spam",
    "-in:trash",
    "-category:social",
    "-category:forums",
    `{${anyOf}}`,
  ].join(" ");
}
