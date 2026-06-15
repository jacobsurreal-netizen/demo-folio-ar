import * as THREE from 'three';

const LOG_INTERVAL_MS = 400;

/** Minimum observation window before stableEnough can be true (tune on device). */
const MIN_OBSERVATION_MS = 600;
const MIN_SAMPLES = 12;

/** EMA thresholds — diagnostic only, not behavioral gates yet. */
const POSITION_DELTA_THRESHOLD = 0.008;
const ANGULAR_DELTA_THRESHOLD = 0.04;
const EMA_ALPHA = 0.15;

export interface PoseConsensusDiagnostics {
  observationAgeMs: number;
  sampleCount: number;
  positionDelta: number;
  positionStability: number;
  angularDeltaRad: number;
  rotationStability: number;
  viewpointQuality: number;
  consensusProgress: number;
  stableEnough: boolean;
}

let glyphDetected = false;
let consensusCamera: THREE.Camera | null = null;

let observationStartMs: number | null = null;
let sampleCount = 0;
let lastLogMs = 0;
let hasPreviousSample = false;
let emaPosDelta = 0;
let emaAngDelta = 0;

const lastPos = new THREE.Vector3();
const lastQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const markerNormal = new THREE.Vector3();
const cameraForward = new THREE.Vector3();

function stabilityFromDelta(delta: number, threshold: number): number {
  if (delta <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - delta / threshold));
}

function computeViewpointQuality(anchor: THREE.Object3D): number {
  if (!consensusCamera) return 1;

  anchor.updateWorldMatrix(true, false);
  markerNormal.set(0, 0, -1).transformDirection(anchor.matrixWorld).normalize();
  consensusCamera.getWorldDirection(cameraForward);

  const rawDot = cameraForward.dot(markerNormal);
  return Math.max(0, Math.min(1, Math.abs(rawDot)));
}

export function setPoseConsensusCamera(camera: THREE.Camera | null): void {
  consensusCamera = camera;
}

export function setGlyphDetected(detected: boolean): void {
  if (detected && !glyphDetected) {
    observationStartMs = performance.now();
    sampleCount = 0;
    hasPreviousSample = false;
    emaPosDelta = 0;
    emaAngDelta = 0;
    lastLogMs = 0;
  }
  glyphDetected = detected;
}

export function resetPoseConsensus(): void {
  glyphDetected = false;
  observationStartMs = null;
  sampleCount = 0;
  hasPreviousSample = false;
  emaPosDelta = 0;
  emaAngDelta = 0;
  lastLogMs = 0;
}

export function samplePoseConsensus(anchor: THREE.Object3D): PoseConsensusDiagnostics | null {
  if (!glyphDetected || observationStartMs === null) return null;

  const now = performance.now();
  anchor.getWorldPosition(tmpPos);
  anchor.getWorldQuaternion(tmpQuat);

  let framePosDelta = 0;
  let frameAngDelta = 0;

  if (hasPreviousSample) {
    framePosDelta = tmpPos.distanceTo(lastPos);
    frameAngDelta = lastQuat.angleTo(tmpQuat);
    emaPosDelta =
      emaPosDelta === 0
        ? framePosDelta
        : emaPosDelta * (1 - EMA_ALPHA) + framePosDelta * EMA_ALPHA;
    emaAngDelta =
      emaAngDelta === 0
        ? frameAngDelta
        : emaAngDelta * (1 - EMA_ALPHA) + frameAngDelta * EMA_ALPHA;
  } else {
    hasPreviousSample = true;
  }

  lastPos.copy(tmpPos);
  lastQuat.copy(tmpQuat);
  sampleCount += 1;

  const observationAgeMs = now - observationStartMs;
  const positionDelta = emaPosDelta || framePosDelta;
  const angularDeltaRad = emaAngDelta || frameAngDelta;
  const positionStability = stabilityFromDelta(positionDelta, POSITION_DELTA_THRESHOLD);
  const rotationStability = stabilityFromDelta(angularDeltaRad, ANGULAR_DELTA_THRESHOLD);
  const viewpointQuality = computeViewpointQuality(anchor);

  const ageProgress = Math.min(1, observationAgeMs / MIN_OBSERVATION_MS);
  const sampleProgress = Math.min(1, sampleCount / MIN_SAMPLES);
  const consensusProgress = Math.max(
    0,
    Math.min(
      1,
      ageProgress * 0.25 +
        sampleProgress * 0.25 +
        positionStability * 0.2 +
        rotationStability * 0.2 +
        viewpointQuality * 0.1,
    ),
  );

  const stableEnough =
    observationAgeMs >= MIN_OBSERVATION_MS &&
    sampleCount >= MIN_SAMPLES &&
    positionStability >= 0.65 &&
    rotationStability >= 0.65 &&
    viewpointQuality >= 0.55;

  const diagnostics: PoseConsensusDiagnostics = {
    observationAgeMs,
    sampleCount,
    positionDelta,
    positionStability,
    angularDeltaRad,
    rotationStability,
    viewpointQuality,
    consensusProgress,
    stableEnough,
  };

  if (now - lastLogMs >= LOG_INTERVAL_MS) {
    lastLogMs = now;
    console.log('[AR PoseConsensus]', {
      observationAgeMs: Math.round(observationAgeMs),
      sampleCount,
      positionDelta: Number(positionDelta.toFixed(5)),
      positionStability: Number(positionStability.toFixed(3)),
      angularDeltaRad: Number(angularDeltaRad.toFixed(4)),
      rotationStability: Number(rotationStability.toFixed(3)),
      viewpointQuality: Number(viewpointQuality.toFixed(3)),
      consensusProgress: Number(consensusProgress.toFixed(3)),
      stableEnough,
    });
  }

  return diagnostics;
}
