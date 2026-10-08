/** What Gmail tells Trackr before any body is fetched. */
export type EmailMetadata = {
  fromName: string | null;
  fromEmail: string;
  subject: string;
  snippet: string;
  /** Gmail label ids, such as CATEGORY_PROMOTIONS. */
  labels: readonly string[];
  hasListUnsubscribe: boolean;
  /** The sender is a contact on one of the user's applications. */
  knownContact?: boolean;
  /** The thread already has a message linked to an application. */
  knownThread?: boolean;
};

/** A relevant message, with its body as plain text (held in memory only). */
export type EmailContent = EmailMetadata & {
  body: string;
  /** Link targets found in the message, for platform and job ids. */
  links: readonly string[];
  /** Start of an attached calendar invitation, as an ISO timestamp. */
  calendarStart: string | null;
};
