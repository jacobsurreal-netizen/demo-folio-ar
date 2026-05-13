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
    this.state = { ...this.state, ...updates };
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
