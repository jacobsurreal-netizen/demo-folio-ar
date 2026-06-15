import * as THREE from 'three';

const LOG_INTERVAL_MS = 400;

/** Sliding window size for pose consensus calibration (diagnostic only). */
export const WINDOW_SIZE = 32;

/** Minimum observation window before windowStableEnough can be true (tune on device). */
export const MIN_OBSERVATION_MS = 600;
export const MIN_SAMPLES = 12;

/** Window spread ranges — calibrate on mobile field tests. */
export const POSITION_SPREAD_GOOD = 6;
export const POSITION_SPREAD_BAD = 48;
export const ROTATION_SPREAD_GOOD = 0.06;
export const ROTATION_SPREAD_BAD = 0.4;
export const VIEWPOINT_MIN_GOOD = 0.55;
export const STABLE_FRAMES_REQUIRED = 8;

/** Per-frame stability thresholds for consecutive stable-frame counting. */
const FRAME_STABLE_POSITION_DELTA = 12;
const FRAME_STABLE_ROT_DELTA = 0.12;

interface WindowSampleSlot {
  timestamp: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  viewpointQuality: number;
}

export interface PoseConsensusDiagnostics {
  observationAgeMs: number;
  sampleCount: number;
  framePositionDelta: number;
  frameAngularDeltaRad: number;
  viewpointQuality: number;
  windowSampleCount: number;
  windowAgeMs: number;
  positionSpread: number;
  positionSpreadMax: number;
  rotationSpreadRad: number;
  viewpointQualityAvg: number;
  viewpointQualityMin: number;
  stableFrameCount: number;
  positionStability: number;
  rotationStability: number;
  consensusProgress: number;
  stableEnough: boolean;
  windowStableEnough: boolean;
}

export interface PoseConsensusSnapshot {
  glyphDetected: boolean;
  diagnostics: PoseConsensusDiagnostics | null;
}

let glyphDetected = false;
let consensusCamera: THREE.Camera | null = null;
let latestDiagnostics: PoseConsensusDiagnostics | null = null;

let observationStartMs: number | null = null;
let sampleCount = 0;
let lastLogMs = 0;
let hasPreviousSample = false;
let consecutiveStableFrames = 0;

let windowWriteIndex = 0;
let windowFilled = 0;
const windowBuffer: WindowSampleSlot[] = [];

const lastPos = new THREE.Vector3();
const lastQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const meanPos = new THREE.Vector3();
const markerNormal = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const repQuat = new THREE.Quaternion();

function ensureWindowBuffer(): void {
  while (windowBuffer.length < WINDOW_SIZE) {
    windowBuffer.push({
      timestamp: 0,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      viewpointQuality: 0,
    });
  }
}

function resetWindow(): void {
  windowWriteIndex = 0;
  windowFilled = 0;
  consecutiveStableFrames = 0;
}

function smoothstep01(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function stabilityFromRange(value: number, good: number, bad: number): number {
  if (value <= good) return 1;
  if (value >= bad) return 0;
  return 1 - smoothstep01((value - good) / (bad - good));
}

function computeViewpointQuality(anchor: THREE.Object3D): number {
  if (!consensusCamera) return 1;

  anchor.updateWorldMatrix(true, false);
  markerNormal.set(0, 0, -1).transformDirection(anchor.matrixWorld).normalize();
  consensusCamera.getWorldDirection(cameraForward);

  const rawDot = cameraForward.dot(markerNormal);
  return Math.max(0, Math.min(1, Math.abs(rawDot)));
}

function pushWindowSample(
  timestamp: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  viewpointQuality: number,
): void {
  ensureWindowBuffer();

  const slot = windowBuffer[windowWriteIndex];
  slot.timestamp = timestamp;
  slot.position.copy(position);
  slot.quaternion.copy(quaternion);
  slot.viewpointQuality = viewpointQuality;

  windowWriteIndex = (windowWriteIndex + 1) % WINDOW_SIZE;
  windowFilled = Math.min(WINDOW_SIZE, windowFilled + 1);
}

function getOrderedWindowSamples(): WindowSampleSlot[] {
  if (windowFilled === 0) return [];

  if (windowFilled < WINDOW_SIZE) {
    return windowBuffer.slice(0, windowFilled);
  }

  const ordered: WindowSampleSlot[] = [];
  for (let i = 0; i < WINDOW_SIZE; i += 1) {
    ordered.push(windowBuffer[(windowWriteIndex + i) % WINDOW_SIZE]);
  }
  return ordered;
}

function computeWindowMetrics(samples: WindowSampleSlot[]): {
  windowAgeMs: number;
  positionSpread: number;
  positionSpreadMax: number;
  rotationSpreadRad: number;
  viewpointQualityAvg: number;
  viewpointQualityMin: number;
} {
  if (samples.length === 0) {
    return {
      windowAgeMs: 0,
      positionSpread: 0,
      positionSpreadMax: 0,
      rotationSpreadRad: 0,
      viewpointQualityAvg: 0,
      viewpointQualityMin: 0,
    };
  }

  meanPos.set(0, 0, 0);
  let viewpointSum = 0;
  let viewpointMin = 1;

  for (const sample of samples) {
    meanPos.add(sample.position);
    viewpointSum += sample.viewpointQuality;
    viewpointMin = Math.min(viewpointMin, sample.viewpointQuality);
  }

  meanPos.multiplyScalar(1 / samples.length);
  repQuat.copy(samples[0].quaternion);

  let spreadSum = 0;
  let spreadMax = 0;
  let rotationSum = 0;

  for (const sample of samples) {
    const distance = sample.position.distanceTo(meanPos);
    spreadSum += distance;
    spreadMax = Math.max(spreadMax, distance);
    rotationSum += repQuat.angleTo(sample.quaternion);
  }

  const oldest = samples[0].timestamp;
  const newest = samples[samples.length - 1].timestamp;

  return {
    windowAgeMs: Math.max(0, newest - oldest),
    positionSpread: spreadSum / samples.length,
    positionSpreadMax: spreadMax,
    rotationSpreadRad: rotationSum / samples.length,
    viewpointQualityAvg: viewpointSum / samples.length,
    viewpointQualityMin: viewpointMin,
  };
}

function updateStableFrameCount(
  framePositionDelta: number,
  frameAngularDeltaRad: number,
  viewpointQuality: number,
): number {
  const frameStable =
    framePositionDelta <= FRAME_STABLE_POSITION_DELTA &&
    frameAngularDeltaRad <= FRAME_STABLE_ROT_DELTA &&
    viewpointQuality >= VIEWPOINT_MIN_GOOD;

  if (frameStable) {
    consecutiveStableFrames += 1;
  } else {
    consecutiveStableFrames = 0;
  }

  return consecutiveStableFrames;
}

export function setPoseConsensusCamera(camera: THREE.Camera | null): void {
  consensusCamera = camera;
}

export function getPoseConsensusSnapshot(): PoseConsensusSnapshot {
  return {
    glyphDetected,
    diagnostics: glyphDetected ? latestDiagnostics : null,
  };
}

export function setGlyphDetected(detected: boolean): void {
  if (detected && !glyphDetected) {
    observationStartMs = performance.now();
    sampleCount = 0;
    hasPreviousSample = false;
    lastLogMs = 0;
    resetWindow();
  }
  glyphDetected = detected;
}

export function resetPoseConsensus(): void {
  glyphDetected = false;
  observationStartMs = null;
  sampleCount = 0;
  hasPreviousSample = false;
  lastLogMs = 0;
  latestDiagnostics = null;
  resetWindow();
}

export function samplePoseConsensus(anchor: THREE.Object3D): PoseConsensusDiagnostics | null {
  if (!glyphDetected || observationStartMs === null) return null;

  const now = performance.now();
  anchor.getWorldPosition(tmpPos);
  anchor.getWorldQuaternion(tmpQuat);
  const viewpointQuality = computeViewpointQuality(anchor);

  let framePositionDelta = 0;
  let frameAngularDeltaRad = 0;

  if (hasPreviousSample) {
    framePositionDelta = tmpPos.distanceTo(lastPos);
    frameAngularDeltaRad = lastQuat.angleTo(tmpQuat);
  } else {
    hasPreviousSample = true;
  }

  lastPos.copy(tmpPos);
  lastQuat.copy(tmpQuat);
  sampleCount += 1;

  pushWindowSample(now, tmpPos, tmpQuat, viewpointQuality);

  const orderedSamples = getOrderedWindowSamples();
  const windowMetrics = computeWindowMetrics(orderedSamples);
  const stableFrameCount = updateStableFrameCount(
    framePositionDelta,
    frameAngularDeltaRad,
    viewpointQuality,
  );

  const observationAgeMs = now - observationStartMs;
  const windowSampleCount = orderedSamples.length;

  const positionStability = stabilityFromRange(
    windowMetrics.positionSpread,
    POSITION_SPREAD_GOOD,
    POSITION_SPREAD_BAD,
  );
  const rotationStability = stabilityFromRange(
    windowMetrics.rotationSpreadRad,
    ROTATION_SPREAD_GOOD,
    ROTATION_SPREAD_BAD,
  );

  const ageProgress = Math.min(1, observationAgeMs / MIN_OBSERVATION_MS);
  const sampleProgress = Math.min(1, windowSampleCount / MIN_SAMPLES);
  const stableFrameProgress = Math.min(1, stableFrameCount / STABLE_FRAMES_REQUIRED);
  const viewpointProgress = Math.min(1, windowMetrics.viewpointQualityAvg / VIEWPOINT_MIN_GOOD);

  const consensusProgress = Math.max(
    0,
    Math.min(
      1,
      ageProgress * 0.15 +
        sampleProgress * 0.15 +
        positionStability * 0.2 +
        rotationStability * 0.2 +
        viewpointProgress * 0.15 +
        stableFrameProgress * 0.15,
    ),
  );

  const windowStableEnough =
    observationAgeMs >= MIN_OBSERVATION_MS &&
    windowSampleCount >= MIN_SAMPLES &&
    windowMetrics.positionSpread <= POSITION_SPREAD_GOOD &&
    windowMetrics.rotationSpreadRad <= ROTATION_SPREAD_GOOD &&
    windowMetrics.viewpointQualityMin >= VIEWPOINT_MIN_GOOD &&
    stableFrameCount >= STABLE_FRAMES_REQUIRED;

  const stableEnough =
    windowStableEnough &&
    positionStability >= 0.65 &&
    rotationStability >= 0.65 &&
    consensusProgress >= 0.7;

  const diagnostics: PoseConsensusDiagnostics = {
    observationAgeMs,
    sampleCount,
    framePositionDelta,
    frameAngularDeltaRad,
    viewpointQuality,
    windowSampleCount,
    windowAgeMs: windowMetrics.windowAgeMs,
    positionSpread: windowMetrics.positionSpread,
    positionSpreadMax: windowMetrics.positionSpreadMax,
    rotationSpreadRad: windowMetrics.rotationSpreadRad,
    viewpointQualityAvg: windowMetrics.viewpointQualityAvg,
    viewpointQualityMin: windowMetrics.viewpointQualityMin,
    stableFrameCount,
    positionStability,
    rotationStability,
    consensusProgress,
    stableEnough,
    windowStableEnough,
  };

  latestDiagnostics = diagnostics;

  if (now - lastLogMs >= LOG_INTERVAL_MS) {
    lastLogMs = now;
    console.log('[AR PoseConsensus]', {
      observationAgeMs: Math.round(observationAgeMs),
      sampleCount,
      framePositionDelta: Number(framePositionDelta.toFixed(3)),
      frameAngularDeltaRad: Number(frameAngularDeltaRad.toFixed(4)),
      windowSampleCount,
      windowAgeMs: Math.round(windowMetrics.windowAgeMs),
      positionSpread: Number(windowMetrics.positionSpread.toFixed(3)),
      positionSpreadMax: Number(windowMetrics.positionSpreadMax.toFixed(3)),
      rotationSpreadRad: Number(windowMetrics.rotationSpreadRad.toFixed(4)),
      viewpointQualityAvg: Number(windowMetrics.viewpointQualityAvg.toFixed(3)),
      viewpointQualityMin: Number(windowMetrics.viewpointQualityMin.toFixed(3)),
      stableFrameCount,
      positionStability: Number(positionStability.toFixed(3)),
      rotationStability: Number(rotationStability.toFixed(3)),
      consensusProgress: Number(consensusProgress.toFixed(3)),
      windowStableEnough,
      stableEnough,
    });
  }

  return diagnostics;
}
