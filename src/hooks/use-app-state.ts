/**
 * SURREAL EXP LAB // DEMO V1
 * Typed state accessor hook.
 */

import { useSyncExternalStore } from 'react';
import { arStore } from '../state/store';
import type { AppState } from '../state/types';

/** Subscribe to the full application state. Re-renders on any state change. */
export function useAppState(): AppState {
  return useSyncExternalStore(
    arStore.subscribe,
    () => arStore.getState(),
    () => arStore.getState(),
  );
}
