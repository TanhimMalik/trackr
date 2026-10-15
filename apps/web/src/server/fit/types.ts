import type { FitResult } from "@trackr/domain";

/** A fit as stored on an application, with what produced it. */
export type StoredFit = FitResult & {
  model: string;
  promptVersion: string;
  costUsd: number;
};
