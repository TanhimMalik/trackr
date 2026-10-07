/**
 * The requested record does not exist or belongs to another user. The two cases
 * are deliberately indistinguishable so ids cannot be probed.
 */
export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

/** Undoing this event would leave its application with no history at all. */
export class LastEventError extends Error {
  constructor() {
    super("An application must keep at least one event");
    this.name = "LastEventError";
  }
}
