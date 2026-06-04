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
  /** Resonance ritual lifecycle (higher-level game state) */
  resonanceState: 'SEARCHING' | 'ACQUIRED_UNSTABLE' | 'LOCKING' | 'CONFIRMED' | 'LOST';
  /** Stabilization progress (0..1) */
  stabilizationProgress: number;
  /** Is the user holding the stabilize control */
  stabilizationHold: boolean;
  /** Manual artifact rotation yaw offset (radians) */
  artifactRotationYaw: number;
  /** Manual artifact rotation pitch offset (radians) */
  artifactRotationPitch: number;
  /** Whether manual rotation input is currently active (pointer down) */
  artifactRotationActive?: boolean;
}

/** Default state — used before AR initialization */
export const INITIAL_STATE: AppState = {
  tracking: 'awaiting',
  hudMode: 'COLOR',
  signalStrength: 0,
  arReady: false,
  modelLoaded: false,
  resonanceState: 'SEARCHING',
  stabilizationProgress: 0,
  stabilizationHold: false,
  artifactRotationYaw: 0,
  artifactRotationPitch: 0,
  artifactRotationActive: false,
};
