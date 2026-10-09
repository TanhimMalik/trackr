/**
 * Copies a Trackr account's synced Gmail into `.benchmark/` for labeling:
 * every message sync found job-related, plus a sample of the ones it
 * ignored. Re-running adds only messages not already exported.
 *
 *   pnpm benchmark:export --email you@example.com [--ignored-sample 150]
 *
 * Prints counts only, never message contents.
 */
import { parseArgs } from "node:util";
import { GmailTemporaryError } from "@/server/integrations/gmail-api";
import { exportBenchmarkEmails } from "@/server/services/email-benchmark";
import { findUserByEmail } from "@/server/services/users";
import { appendRecord, BENCHMARK_DIR, loadEnv, readRecords } from "./store";

loadEnv();

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    "ignored-sample": { type: "string", default: "150" },
  },
});

if (!values.email) {
  console.error(
    "Usage: pnpm benchmark:export --email you@example.com [--ignored-sample 150]",
  );
  process.exit(1);
}

const user = await findUserByEmail(values.email);
if (!user) {
  console.error(`No Trackr account for ${values.email}.`);
  process.exit(1);
}

const exported = new Set(readRecords().map((record) => record.id));
const before = exported.size;
const counts = new Map<string, number>();
let added = 0;
// Gmail's per-user rate limit can outlast the client's retries: pause and
// pick up where it stopped, since each record is saved as it arrives.
for (let pauses = 0; ; pauses++) {
  try {
    for await (const record of exportBenchmarkEmails(user.id, {
      ignoredSample: Number(values["ignored-sample"]),
      skip: exported,
      concurrency: 2,
    })) {
      appendRecord(record);
      exported.add(record.id);
      added++;
      counts.set(record.syncStatus, (counts.get(record.syncStatus) ?? 0) + 1);
      if (added % 25 === 0) console.log(`Exported ${added}…`);
    }
    break;
  } catch (error) {
    if (!(error instanceof GmailTemporaryError) || pauses >= 10) throw error;
    console.log(
      `Gmail asked to slow down (${error.status}); waiting a minute…`,
    );
    await new Promise((done) => setTimeout(done, 60_000));
  }
}

console.log(
  `Added ${added} emails (${[...counts].map(([status, n]) => `${n} ${status.toLowerCase()}`).join(", ") || "none new"}); ${before + added} in ${BENCHMARK_DIR}`,
);
process.exit(0);
