/**
 * SURREAL EXP LAB // DEMO V1
 * AR configuration constants.
 *
 * All paths, scales, and MindAR tuning parameters live here.
 * Marker and model can be hot-swapped by changing these values.
 */

// ── Marker targets ──────────────────────────────────────────────
// Primary: photographed printed business card
// Fallback: high-contrast design export
// Swap by changing the active path below.

export const MARKER_TARGETS = {
  /** Photographed printed embossed business card */
  cardPhoto: '/markers/card-photo.mind',
  /** High-contrast design export (fallback) */
  cardDesign: '/markers/card-design.mind',
} as const;

/** Active marker — change this to swap targets during development */
export const ACTIVE_MARKER = MARKER_TARGETS.cardPhoto;

// ── Artifact model ──────────────────────────────────────────────

export const ARTIFACT_CONFIG = {
  /** Path to the artifact GLB (served from public/) */
  modelPath: '/models/artifact.glb',
  /** Uniform scale applied to the loaded model */
  scale: 0.35,
  /** Position offset relative to marker anchor */
  position: { x: 0, y: 0.3, z: 0 } as const,
  /** Y-axis rotation speed (radians per frame) */
  rotationSpeed: 0.003,
} as const;

// ── MindAR tracking parameters ──────────────────────────────────
// See: https://hiukim.github.io/mind-ar-js-doc/quick-start/tracking-config
//
// PASS 1: Marker Tracking Stability — Jitter Reduction
// - Increased filterBeta for better responsiveness to fast movement
// - Slightly raised filterMinCF for smoother tracking without excessive lag
// - Reduced warmupTolerance for faster lock acquisition

export const MINDAR_CONFIG = {
  /** One-euro filter cutoff frequency (lower = smoother, more latency) */
  filterMinCF: 0.0003,
  /** One-euro filter speed coefficient (higher = less delay on fast movement) */
  filterBeta: 1500,
  /** Continuous frames required before target-found fires */
  warmupTolerance: 4,
  /** Continuous frames required before target-lost fires */
  missTolerance: 5,
  /** Max simultaneous tracked targets */
  maxTrack: 1,
} as const;

// ── Gateway ─────────────────────────────────────────────────────

export const GATEWAY_URL = 'https://surreal-xp-lab-folio.vercel.app/recon';

// ── Lost → Awaiting timeout ─────────────────────────────────────

/** Milliseconds before 'lost' state falls back to 'awaiting' */
export const LOST_TIMEOUT_MS = 3000;
