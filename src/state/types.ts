/**
 * SURREAL EXP LAB // DEMO V1
 * State type definitions.
 *
 * These types are the contract between the AR scene layer and the HUD layer.
 * Neither layer imports from the other — they communicate only through state.
 */

/** MindAR image tracking lifecycle */
export type TrackingState = 'awaiting' | 'locked' | 'lost';

/** HUD visual mode */
export type HudMode = 'COLOR' | 'IR';

/** Full application state */
export interface AppState {
  /** Current tracking lifecycle phase */
  tracking: TrackingState;
  /** Active HUD color mode */
  hudMode: HudMode;
  /** Tracking signal confidence (0 = no signal, 1 = full lock) */
  signalStrength: number;
  /** MindAR initialized and camera streaming */
  arReady: boolean;
  /** Artifact GLB model loaded into scene */
  modelLoaded: boolean;
}

/** Default state — used before AR initialization */
export const INITIAL_STATE: AppState = {
  tracking: 'awaiting',
  hudMode: 'COLOR',
  signalStrength: 0,
  arReady: false,
  modelLoaded: false,
};
