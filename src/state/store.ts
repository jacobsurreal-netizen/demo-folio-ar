/**
 * SURREAL EXP LAB // DEMO V1
 * Global state store.
 *
 * Follows the same StateStore pattern used in the main folio runtime.
 * Zero dependencies — uses React 19's useSyncExternalStore natively.
 *
 * ┌──────────┐     writes      ┌───────────┐     reads      ┌──────────┐
 * │ AR Layer │ ──────────────► │ ARStore   │ ◄──────────── │ HUD Layer│
 * └──────────┘                 └───────────┘                └──────────┘
 */

import { type AppState, INITIAL_STATE } from './types';

class ARStateStore {
  private state: AppState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();

  /** Read current state snapshot (immutable reference) */
  public getState(): AppState {
    return this.state;
  }

  /** Merge partial updates into state and notify all subscribers */
  public setState(updates: Partial<AppState>): void {
    // Merge incoming updates into a candidate next state
    const prev = this.state;
    const merged: AppState = { ...this.state, ...updates } as AppState;

    // Deterministic mapping: technical `tracking` -> experiential `resonanceState`
    // RULES (Pass 1B):
    // - awaiting -> SEARCHING (reset progress + hold)
    // - lost -> LOST (clear hold, keep progress)
    // - locked -> if previously SEARCHING or LOST -> ACQUIRED_UNSTABLE
    //            if previously LOCKING or CONFIRMED -> preserve

    const next: AppState = { ...merged };

    if (merged.tracking === 'awaiting') {
      next.resonanceState = 'SEARCHING';
      next.stabilizationProgress = 0;
      next.stabilizationHold = false;
      // Reset any manual rotation when the ritual re-arms
      next.artifactRotationYaw = 0;
      next.artifactRotationPitch = 0;
      next.artifactRotationActive = false;
    } else if (merged.tracking === 'lost') {
      // Lost re-arms the ritual: clear progress and hold
      next.resonanceState = 'LOST';
      next.stabilizationHold = false;
      next.stabilizationProgress = 0;
      // Reset manual rotation on lost
      next.artifactRotationYaw = 0;
      next.artifactRotationPitch = 0;
      next.artifactRotationActive = false;
    } else if (merged.tracking === 'locked') {
      const prevRes = prev.resonanceState;
      const currRes = merged.resonanceState ?? prevRes;

      // Preserve explicit LOCKING/CONFIRMED states
      if (currRes === 'LOCKING' || currRes === 'CONFIRMED') {
        next.resonanceState = currRes;
      } else if (prevRes === 'SEARCHING' || prevRes === 'LOST' || currRes === 'SEARCHING' || currRes === 'LOST') {
        next.resonanceState = 'ACQUIRED_UNSTABLE';
      } else {
        // Default safe transition to ACQUIRED_UNSTABLE
        next.resonanceState = currRes || 'ACQUIRED_UNSTABLE';
      }
      // If we're arriving from SEARCHING or LOST, re-arm progress to 0 unless LOCKING/CONFIRMED
      if ((prev.resonanceState === 'SEARCHING' || prev.resonanceState === 'LOST') && next.resonanceState !== 'LOCKING' && next.resonanceState !== 'CONFIRMED') {
        next.stabilizationProgress = 0;
        next.stabilizationHold = false;
      }
    }

    // If the experiential state re-arms to SEARCHING or becomes LOST, clear manual rotation offsets
    if (next.resonanceState === 'SEARCHING' || next.resonanceState === 'LOST') {
      next.artifactRotationYaw = 0;
      next.artifactRotationPitch = 0;
      next.artifactRotationActive = false;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  /** Subscribe to state changes — returns unsubscribe function */
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reset to initial state (useful for cleanup/restart) */
  public reset(): void {
    this.setState({ ...INITIAL_STATE });
  }
}

/** Singleton store instance — shared between AR and HUD layers */
export const arStore = new ARStateStore();
