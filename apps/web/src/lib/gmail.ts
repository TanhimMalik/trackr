/**
 * A link that opens a message in Gmail, or null for the demo's simulated
 * emails, which exist only in Trackr.
 */
export function gmailMessageUrl(messageId: string): string | null {
  if (messageId.startsWith("demo-")) return null;
  return `https://mail.google.com/mail/#all/${encodeURIComponent(messageId)}`;
}
