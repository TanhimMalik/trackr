import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns false during server rendering and hydration, true afterwards.
 * Use it to defer UI that depends on client-only state (such as the resolved theme).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
