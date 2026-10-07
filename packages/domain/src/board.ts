import type { ApplicationStatus } from "./enums";

type BoardColumnDefinition = {
  id: string;
  label: string;
  /** Statuses shown in this column. */
  statuses: readonly ApplicationStatus[];
  /** Status applied when a card from another column is dropped here. */
  dropStatus: ApplicationStatus;
};

/** Kanban columns. Every status belongs to exactly one column. */
export const BOARD_COLUMNS = [
  { id: "saved", label: "Saved", statuses: ["SAVED"], dropStatus: "SAVED" },
  {
    id: "applied",
    label: "Applied",
    statuses: ["APPLIED", "UNKNOWN"],
    dropStatus: "APPLIED",
  },
  {
    id: "assessment",
    label: "Assessment",
    statuses: ["ASSESSMENT"],
    dropStatus: "ASSESSMENT",
  },
  {
    id: "interview",
    label: "Interview",
    statuses: ["RECRUITER_SCREEN", "INTERVIEW", "FINAL_ROUND"],
    dropStatus: "INTERVIEW",
  },
  { id: "offer", label: "Offer", statuses: ["OFFER"], dropStatus: "OFFER" },
  {
    id: "closed",
    label: "Closed",
    statuses: ["REJECTED", "WITHDRAWN"],
    dropStatus: "REJECTED",
  },
] as const satisfies readonly BoardColumnDefinition[];

export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export type BoardColumnId = BoardColumn["id"];

/** Columns shown on the Overview, which focuses on the active pipeline. */
export const ACTIVE_BOARD_COLUMN_IDS = [
  "applied",
  "assessment",
  "interview",
  "offer",
] as const satisfies readonly BoardColumnId[];

export function boardColumnForStatus(status: ApplicationStatus): BoardColumnId {
  const column = BOARD_COLUMNS.find((candidate) =>
    (candidate.statuses as readonly ApplicationStatus[]).includes(status),
  );
  if (!column) throw new Error(`No board column for status ${status}`);
  return column.id;
}

/**
 * The status to record when a card is dropped on a column, or null when the
 * card already belongs there (for example, a final-round card dropped back on
 * Interview keeps its more specific status).
 */
export function statusForBoardDrop(
  current: ApplicationStatus,
  columnId: BoardColumnId,
): ApplicationStatus | null {
  if (boardColumnForStatus(current) === columnId) return null;
  const column = BOARD_COLUMNS.find((candidate) => candidate.id === columnId);
  if (!column) throw new Error(`Unknown board column ${columnId}`);
  return column.dropStatus;
}
