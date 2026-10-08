import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { PlatformDetector } from "./types";

export const DETECTORS: readonly PlatformDetector[] = [
  greenhouse,
  lever,
  ashby,
];

export function detectorFor(url: URL): PlatformDetector | null {
  return DETECTORS.find((detector) => detector.matches(url)) ?? null;
}

export type { Confirmation, DetectedJob, PlatformDetector } from "./types";
