/**
 * Fills an account's workspace with demo applications.
 *
 *   pnpm db:seed --email you@example.com [--reset]
 *
 * The account must have signed in once. --reset deletes the account's existing
 * applications first.
 */
import { parseArgs } from "node:util";
import { deleteAllApplications } from "@/server/services/applications";
import { seedDemoWorkspace } from "@/server/services/demo-workspace";
import { findUserByEmail } from "@/server/services/users";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to the process environment.
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    reset: { type: "boolean", default: false },
  },
});

if (!values.email) {
  console.error("Usage: pnpm db:seed --email you@example.com [--reset]");
  process.exit(1);
}

const user = await findUserByEmail(values.email);
if (!user) {
  console.error(
    `No Trackr account for ${values.email}. Sign in to the app once first.`,
  );
  process.exit(1);
}

if (values.reset) {
  const deleted = await deleteAllApplications(user.id);
  console.log(`Deleted ${deleted} existing applications.`);
}

try {
  const result = await seedDemoWorkspace(user.id);
  console.log(
    `Added ${result.applications} demo applications with ${result.events} events for ${user.email}.`,
  );
} catch (error) {
  if (error instanceof Error && error.name === "WorkspaceNotEmptyError") {
    console.error(
      "This account already has applications. Run again with --reset to replace them.",
    );
    process.exit(1);
  }
  throw error;
}

process.exit(0);
