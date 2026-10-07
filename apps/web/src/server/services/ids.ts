import { NotFoundError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Treats a malformed id like a missing record, so a bad link shows "not
 * found" instead of reaching the database as an invalid uuid.
 */
export function assertId(id: string, entity: string): void {
  if (!UUID.test(id)) throw new NotFoundError(entity);
}
