import { describe, expect, it } from "vitest";
import {
  ACTIVE_BOARD_COLUMN_IDS,
  BOARD_COLUMNS,
  boardColumnForStatus,
  statusForBoardDrop,
} from "./board";
import { APPLICATION_STATUSES, type ApplicationStatus } from "./enums";

describe("board columns", () => {
  it("places every status in exactly one column", () => {
    for (const status of APPLICATION_STATUSES) {
      const columns = BOARD_COLUMNS.filter((column) =>
        (column.statuses as readonly ApplicationStatus[]).includes(status),
      );
      expect(columns, status).toHaveLength(1);
    }
  });

  it("groups related statuses", () => {
    expect(boardColumnForStatus("RECRUITER_SCREEN")).toBe("interview");
    expect(boardColumnForStatus("FINAL_ROUND")).toBe("interview");
    expect(boardColumnForStatus("WITHDRAWN")).toBe("closed");
    expect(boardColumnForStatus("UNKNOWN")).toBe("applied");
  });

  it("drops each column's own status in its drop target", () => {
    for (const column of BOARD_COLUMNS) {
      expect(boardColumnForStatus(column.dropStatus)).toBe(column.id);
    }
  });

  it("only offers active columns on the overview", () => {
    expect(ACTIVE_BOARD_COLUMN_IDS).toEqual([
      "applied",
      "assessment",
      "interview",
      "offer",
    ]);
  });
});

describe("statusForBoardDrop", () => {
  it("returns the column's status when a card moves to another column", () => {
    expect(statusForBoardDrop("APPLIED", "interview")).toBe("INTERVIEW");
    expect(statusForBoardDrop("INTERVIEW", "closed")).toBe("REJECTED");
    expect(statusForBoardDrop("OFFER", "applied")).toBe("APPLIED");
  });

  it("returns null when the card already belongs to the column", () => {
    expect(statusForBoardDrop("FINAL_ROUND", "interview")).toBeNull();
    expect(statusForBoardDrop("WITHDRAWN", "closed")).toBeNull();
    expect(statusForBoardDrop("APPLIED", "applied")).toBeNull();
  });
});
