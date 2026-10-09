import { describe, expect, it } from "vitest";
import { backfillQuery } from "./gmail-query";
import {
  calendarStart,
  parseAddress,
  toEmailContent,
  toEmailMetadata,
  type GmailMessage,
} from "./gmail-message";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

const message: GmailMessage = {
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX", "CATEGORY_UPDATES"],
  snippet: "Thanks for applying to Northwind Labs&#39; Platform team",
  internalDate: "1791460800000",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      {
        name: "From",
        value: '"Northwind Labs Hiring Team" <No-Reply@us.greenhouse-mail.io>',
      },
      { name: "Subject", value: "Thank you for applying to Northwind Labs" },
    ],
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          {
            mimeType: "text/html",
            body: {
              data: b64(
                '<p>Hi Sam,</p><p>See the <a href="https://job-boards.greenhouse.io/northwindlabs/jobs/4012345">posting</a>.</p>',
              ),
            },
          },
        ],
      },
      {
        mimeType: "text/calendar",
        body: {
          data: b64("BEGIN:VEVENT\r\nDTSTART:20261015T180000Z\r\nEND:VEVENT"),
        },
      },
    ],
  },
};

describe("Gmail messages", () => {
  it("reads sender, subject, snippet and labels as metadata", () => {
    expect(toEmailMetadata(message, { knownThread: true })).toEqual({
      fromName: "Northwind Labs Hiring Team",
      fromEmail: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for applying to Northwind Labs",
      snippet: "Thanks for applying to Northwind Labs' Platform team",
      labels: ["INBOX", "CATEGORY_UPDATES"],
      hasListUnsubscribe: false,
      knownThread: true,
    });
  });

  it("reads the body as text with its links and calendar invitation", () => {
    const content = toEmailContent(message, toEmailMetadata(message));
    expect(content.body).toBe("Hi Sam,\nSee the posting .");
    expect(content.links).toEqual([
      "https://job-boards.greenhouse.io/northwindlabs/jobs/4012345",
    ]);
    expect(content.calendarStart).toBe("2026-10-15T18:00:00.000Z");
  });

  it("parses addresses with and without a display name", () => {
    expect(parseAddress("Priya Raman <Priya@Fabrikam.example>")).toEqual({
      name: "Priya Raman",
      email: "priya@fabrikam.example",
    });
    expect(parseAddress("jobs@globex.example")).toEqual({
      name: null,
      email: "jobs@globex.example",
    });
  });

  it("leaves calendar times in a named zone for the person to confirm", () => {
    expect(
      calendarStart("DTSTART;TZID=America/New_York:20261015T140000"),
    ).toBeNull();
  });
});

describe("backfillQuery", () => {
  it("searches recent job mail and skips noise", () => {
    expect(backfillQuery(1_790_000_000, ["greenhouse.io"])).toBe(
      'after:1790000000 -in:chats -in:spam -in:trash -category:social -category:forums {from:greenhouse.io application applied applying interview candidate candidacy assessment offer recruiter recruiting position role "next steps" "thank you for applying"}',
    );
  });
});
