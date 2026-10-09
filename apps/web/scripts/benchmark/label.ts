/**
 * A local page for labeling the exported emails, one at a time, by keyboard.
 *
 *   pnpm benchmark:label    then open http://127.0.0.1:4100
 *
 * Only listens on this machine. Labels are saved to `.benchmark/labels.json`
 * as you go. Classifications start blank on purpose, so the rules' answer
 * doesn't sway yours; company and role start from what the rules extracted,
 * since typing them is slow, so check them.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import {
  benchmarkSplit,
  EMAIL_CLASSIFICATIONS,
  extractEmailDetails,
  emailClassificationSchema,
} from "@trackr/domain";
import { z } from "zod";
import { readLabels, readRecords, writeLabels } from "./store";

const PORT = Number(process.env.BENCHMARK_PORT ?? 4100);
const ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);
const page = readFileSync(new URL("./label.html", import.meta.url), "utf8");

const labelInput = z.object({
  id: z.string().min(1),
  label: z
    .object({
      relevant: z.boolean(),
      classification: emailClassificationSchema.nullable(),
      companyName: z.string().trim().max(200).nullable(),
      jobTitle: z.string().trim().max(200).nullable(),
      notes: z.string().trim().max(500).optional(),
    })
    .nullable(),
});

const records = readRecords();
if (records.length === 0) {
  console.error("Nothing to label. Run pnpm benchmark:export first.");
  process.exit(1);
}
const known = new Set(records.map((record) => record.id));

function state() {
  const labels = readLabels();
  return {
    classifications: EMAIL_CLASSIFICATIONS,
    items: records.map(({ id, receivedAt, syncStatus, email }) => {
      const details = extractEmailDetails(email);
      return {
        id,
        receivedAt,
        syncStatus,
        split: benchmarkSplit(id),
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        subject: email.subject,
        gmailLabels: email.labels,
        body: email.body,
        linkHosts: [
          ...new Set(
            email.links.flatMap((link) => {
              try {
                return [new URL(link).host];
              } catch {
                return [];
              }
            }),
          ),
        ].slice(0, 8),
        suggestion: {
          companyName: details.companyName,
          jobTitle: details.jobTitle,
        },
        label: labels[id] ?? null,
      };
    }),
  };
}

const server = createServer((request, response) => {
  // Reject other sites' pages and rebinding tricks: this serves real email.
  const host = request.headers.host ?? "";
  if (!ORIGINS.has(`http://${host}`)) {
    response.writeHead(403).end();
    return;
  }
  const send = (status: number, body: string, type: string) =>
    response
      .writeHead(status, {
        "content-type": type,
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
      })
      .end(body);

  if (request.method === "GET" && request.url === "/") {
    send(200, page, "text/html; charset=utf-8");
  } else if (request.method === "GET" && request.url === "/api/state") {
    send(200, JSON.stringify(state()), "application/json");
  } else if (request.method === "POST" && request.url === "/api/label") {
    if (
      !ORIGINS.has(request.headers.origin ?? "") ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      send(403, "{}", "application/json");
      return;
    }
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
      if (raw.length > 10_000) request.destroy();
    });
    request.on("end", () => {
      const parsed = labelInput.safeParse(JSON.parse(raw || "null"));
      if (!parsed.success || !known.has(parsed.data.id)) {
        send(400, "{}", "application/json");
        return;
      }
      const labels = readLabels();
      const { id, label } = parsed.data;
      if (label) {
        labels[id] = {
          ...label,
          classification: label.relevant ? label.classification : null,
          companyName: label.companyName || null,
          jobTitle: label.jobTitle || null,
          labeledAt: new Date().toISOString(),
        };
      } else {
        delete labels[id];
      }
      writeLabels(labels);
      send(
        200,
        JSON.stringify({ labeled: Object.keys(labels).length }),
        "application/json",
      );
    });
  } else {
    send(404, "", "text/plain");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Labeling ${records.length} emails at http://127.0.0.1:${PORT} (Ctrl+C to stop).`,
  );
});
