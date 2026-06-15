import * as THREE from 'three';

const LOG_INTERVAL_MS = 400;

/** Sliding window size for pose consensus calibration (diagnostic only). */
export const WINDOW_SIZE = 32;

/** Minimum observation window before windowStableEnough can be true (tune on device). */
export const MIN_OBSERVATION_MS = 600;
export const MIN_SAMPLES = 12;

/** Raw world-space spread ranges — reference only, not primary gate metrics. */
export const POSITION_SPREAD_GOOD = 6;
export const POSITION_SPREAD_BAD = 48;
export const ROTATION_SPREAD_GOOD = 0.06;
export const ROTATION_SPREAD_BAD = 0.4;
export const VIEWPOINT_MIN_GOOD = 0.55;
export const STABLE_FRAMES_REQUIRED = 8;

/** Projected / normalized spread ranges (NDC screen units unless noted). */
export const SCREEN_SPREAD_GOOD = 0.008;
export const SCREEN_SPREAD_BAD = 0.055;
export const DEPTH_SPREAD_GOOD = 0.02;
export const DEPTH_SPREAD_BAD = 0.14;
export const NORMAL_SPREAD_GOOD = 0.04;
export const NORMAL_SPREAD_BAD = 0.28;

/** Per-frame stability thresholds for consecutive stable-frame counting. */
const FRAME_STABLE_SCREEN_DELTA = 0.018;
const FRAME_STABLE_ROT_DELTA = 0.12;

interface WindowSampleSlot {
  timestamp: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  viewpointQuality: number;
  screenX: number;
  screenY: number;
  screenZ: number;
  cameraDistance: number;
  markerNormal: THREE.Vector3;
}

export interface PoseConsensusDiagnostics {
  observationAgeMs: number;
  sampleCount: number;
  framePositionDelta: number;
  frameAngularDeltaRad: number;
  viewpointQuality: number;
  windowSampleCount: number;
  windowAgeMs: number;
  positionSpreadRaw: number;
  positionSpreadMaxRaw: number;
  rotationSpreadRad: number;
  viewpointQualityAvg: number;
  viewpointQualityMin: number;
  stableFrameCount: number;
  screenCenterDelta: number;
  screenCenterSpread: number;
  screenCenterSpreadMax: number;
  cameraDistance: number;
  cameraDistanceDelta: number;
  cameraDistanceSpread: number;
  normalAngularSpreadRad: number;
  positionStability: number;
  rotationStability: number;
  screenStability: number;
  depthStability: number;
  normalStability: number;
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
const projectedPos = new THREE.Vector3();
const meanPos = new THREE.Vector3();
const markerNormal = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const repQuat = new THREE.Quaternion();
const repNormal = new THREE.Vector3();

let lastScreenX = 0;
let lastScreenY = 0;
let lastCameraDistance = 0;

function ensureWindowBuffer(): void {
  while (windowBuffer.length < WINDOW_SIZE) {
    windowBuffer.push({
      timestamp: 0,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      viewpointQuality: 0,
      screenX: 0,
      screenY: 0,
      screenZ: 0,
      cameraDistance: 0,
      markerNormal: new THREE.Vector3(),
    });
  }
}

function resetWindow(): void {
  windowWriteIndex = 0;
  windowFilled = 0;
  consecutiveStableFrames = 0;
  lastScreenX = 0;
  lastScreenY = 0;
  lastCameraDistance = 0;
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

function computeMarkerNormal(anchor: THREE.Object3D, target: THREE.Vector3): void {
  anchor.updateWorldMatrix(true, false);
  target.set(0, 0, -1).transformDirection(anchor.matrixWorld).normalize();
}

function computeViewpointQuality(anchor: THREE.Object3D): number {
  if (!consensusCamera) return 1;

  computeMarkerNormal(anchor, markerNormal);
  consensusCamera.getWorldDirection(cameraForward);

  const rawDot = cameraForward.dot(markerNormal);
  return Math.max(0, Math.min(1, Math.abs(rawDot)));
}

function projectAnchorSample(
  anchor: THREE.Object3D,
  position: THREE.Vector3,
): {
  screenX: number;
  screenY: number;
  screenZ: number;
  cameraDistance: number;
} {
  computeMarkerNormal(anchor, markerNormal);

  if (!consensusCamera) {
    return {
      screenX: 0,
      screenY: 0,
      screenZ: 0,
      cameraDistance: 0,
    };
  }

  projectedPos.copy(position);
  projectedPos.project(consensusCamera);

  return {
    screenX: projectedPos.x,
    screenY: projectedPos.y,
    screenZ: projectedPos.z,
    cameraDistance: position.distanceTo(consensusCamera.position),
  };
}

function pushWindowSample(
  timestamp: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  viewpointQuality: number,
  screenX: number,
  screenY: number,
  screenZ: number,
  cameraDistance: number,
  normal: THREE.Vector3,
): void {
  ensureWindowBuffer();

  const slot = windowBuffer[windowWriteIndex];
  slot.timestamp = timestamp;
  slot.position.copy(position);
  slot.quaternion.copy(quaternion);
  slot.viewpointQuality = viewpointQuality;
  slot.screenX = screenX;
  slot.screenY = screenY;
  slot.screenZ = screenZ;
  slot.cameraDistance = cameraDistance;
  slot.markerNormal.copy(normal);

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
  positionSpreadRaw: number;
  positionSpreadMaxRaw: number;
  rotationSpreadRad: number;
  viewpointQualityAvg: number;
  viewpointQualityMin: number;
  screenCenterSpread: number;
  screenCenterSpreadMax: number;
  cameraDistanceSpread: number;
  normalAngularSpreadRad: number;
} {
  if (samples.length === 0) {
    return {
      windowAgeMs: 0,
      positionSpreadRaw: 0,
      positionSpreadMaxRaw: 0,
      rotationSpreadRad: 0,
      viewpointQualityAvg: 0,
      viewpointQualityMin: 0,
      screenCenterSpread: 0,
      screenCenterSpreadMax: 0,
      cameraDistanceSpread: 0,
      normalAngularSpreadRad: 0,
    };
  }

  meanPos.set(0, 0, 0);
  let meanScreenX = 0;
  let meanScreenY = 0;
  let meanCameraDistance = 0;
  let viewpointSum = 0;
  let viewpointMin = 1;

  for (const sample of samples) {
    meanPos.add(sample.position);
    meanScreenX += sample.screenX;
    meanScreenY += sample.screenY;
    meanCameraDistance += sample.cameraDistance;
    viewpointSum += sample.viewpointQuality;
    viewpointMin = Math.min(viewpointMin, sample.viewpointQuality);
  }

  const invCount = 1 / samples.length;
  meanPos.multiplyScalar(invCount);
  meanScreenX *= invCount;
  meanScreenY *= invCount;
  meanCameraDistance *= invCount;

  repQuat.copy(samples[0].quaternion);
  repNormal.copy(samples[0].markerNormal);

  let rawSpreadSum = 0;
  let rawSpreadMax = 0;
  let rotationSum = 0;
  let screenSpreadSum = 0;
  let screenSpreadMax = 0;
  let depthSpreadSum = 0;
  let normalSpreadSum = 0;

  for (const sample of samples) {
    const rawDistance = sample.position.distanceTo(meanPos);
    rawSpreadSum += rawDistance;
    rawSpreadMax = Math.max(rawSpreadMax, rawDistance);
    rotationSum += repQuat.angleTo(sample.quaternion);

    const screenDx = sample.screenX - meanScreenX;
    const screenDy = sample.screenY - meanScreenY;
    const screenDistance = Math.hypot(screenDx, screenDy);
    screenSpreadSum += screenDistance;
    screenSpreadMax = Math.max(screenSpreadMax, screenDistance);

    depthSpreadSum += Math.abs(sample.cameraDistance - meanCameraDistance);
    normalSpreadSum += repNormal.angleTo(sample.markerNormal);
  }

  const oldest = samples[0].timestamp;
  const newest = samples[samples.length - 1].timestamp;
  const depthSpreadRatio = depthSpreadSum * invCount / Math.max(meanCameraDistance, 0.001);

  return {
    windowAgeMs: Math.max(0, newest - oldest),
    positionSpreadRaw: rawSpreadSum * invCount,
    positionSpreadMaxRaw: rawSpreadMax,
    rotationSpreadRad: rotationSum * invCount,
    viewpointQualityAvg: viewpointSum * invCount,
    viewpointQualityMin: viewpointMin,
    screenCenterSpread: screenSpreadSum * invCount,
    screenCenterSpreadMax: screenSpreadMax,
    cameraDistanceSpread: depthSpreadRatio,
    normalAngularSpreadRad: normalSpreadSum * invCount,
  };
}

function updateStableFrameCount(
  screenCenterDelta: number,
  frameAngularDeltaRad: number,
  viewpointQuality: number,
): number {
  const frameStable =
    screenCenterDelta <= FRAME_STABLE_SCREEN_DELTA &&
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
  const projection = projectAnchorSample(anchor, tmpPos);

  let framePositionDelta = 0;
  let frameAngularDeltaRad = 0;
  let screenCenterDelta = 0;
  let cameraDistanceDelta = 0;

  if (hasPreviousSample) {
    framePositionDelta = tmpPos.distanceTo(lastPos);
    frameAngularDeltaRad = lastQuat.angleTo(tmpQuat);
    screenCenterDelta = Math.hypot(
      projection.screenX - lastScreenX,
      projection.screenY - lastScreenY,
    );
    cameraDistanceDelta = Math.abs(projection.cameraDistance - lastCameraDistance);
  } else {
    hasPreviousSample = true;
  }

  lastPos.copy(tmpPos);
  lastQuat.copy(tmpQuat);
  lastScreenX = projection.screenX;
  lastScreenY = projection.screenY;
  lastCameraDistance = projection.cameraDistance;
  sampleCount += 1;

  pushWindowSample(
    now,
    tmpPos,
    tmpQuat,
    viewpointQuality,
    projection.screenX,
    projection.screenY,
    projection.screenZ,
    projection.cameraDistance,
    markerNormal,
  );

  const orderedSamples = getOrderedWindowSamples();
  const windowMetrics = computeWindowMetrics(orderedSamples);
  const stableFrameCount = updateStableFrameCount(
    screenCenterDelta,
    frameAngularDeltaRad,
    viewpointQuality,
  );

  const observationAgeMs = now - observationStartMs;
  const windowSampleCount = orderedSamples.length;

  const positionStability = stabilityFromRange(
    windowMetrics.positionSpreadRaw,
    POSITION_SPREAD_GOOD,
    POSITION_SPREAD_BAD,
  );
  const rotationStability = stabilityFromRange(
    windowMetrics.rotationSpreadRad,
    ROTATION_SPREAD_GOOD,
    ROTATION_SPREAD_BAD,
  );
  const screenStability = stabilityFromRange(
    windowMetrics.screenCenterSpread,
    SCREEN_SPREAD_GOOD,
    SCREEN_SPREAD_BAD,
  );
  const depthStability = stabilityFromRange(
    windowMetrics.cameraDistanceSpread,
    DEPTH_SPREAD_GOOD,
    DEPTH_SPREAD_BAD,
  );
  const normalStability = stabilityFromRange(
    windowMetrics.normalAngularSpreadRad,
    NORMAL_SPREAD_GOOD,
    NORMAL_SPREAD_BAD,
  );

  const ageProgress = Math.min(1, observationAgeMs / MIN_OBSERVATION_MS);
  const sampleProgress = Math.min(1, windowSampleCount / MIN_SAMPLES);
  const stableFrameProgress = Math.min(1, stableFrameCount / STABLE_FRAMES_REQUIRED);
  const viewpointProgress = Math.min(1, windowMetrics.viewpointQualityAvg / VIEWPOINT_MIN_GOOD);

  const consensusProgress = Math.max(
    0,
    Math.min(
      1,
      ageProgress * 0.1 +
        sampleProgress * 0.1 +
        screenStability * 0.25 +
        normalStability * 0.2 +
        rotationStability * 0.1 +
        viewpointProgress * 0.15 +
        depthStability * 0.05 +
        stableFrameProgress * 0.05,
    ),
  );

  const windowStableEnough =
    observationAgeMs >= MIN_OBSERVATION_MS &&
    windowSampleCount >= MIN_SAMPLES &&
    windowMetrics.screenCenterSpread <= SCREEN_SPREAD_GOOD &&
    windowMetrics.normalAngularSpreadRad <= NORMAL_SPREAD_GOOD &&
    windowMetrics.viewpointQualityMin >= VIEWPOINT_MIN_GOOD &&
    stableFrameCount >= STABLE_FRAMES_REQUIRED;

  const stableEnough =
    windowStableEnough &&
    screenStability >= 0.65 &&
    normalStability >= 0.65 &&
    consensusProgress >= 0.7;

  const diagnostics: PoseConsensusDiagnostics = {
    observationAgeMs,
    sampleCount,
    framePositionDelta,
    frameAngularDeltaRad,
    viewpointQuality,
    windowSampleCount,
    windowAgeMs: windowMetrics.windowAgeMs,
    positionSpreadRaw: windowMetrics.positionSpreadRaw,
    positionSpreadMaxRaw: windowMetrics.positionSpreadMaxRaw,
    rotationSpreadRad: windowMetrics.rotationSpreadRad,
    viewpointQualityAvg: windowMetrics.viewpointQualityAvg,
    viewpointQualityMin: windowMetrics.viewpointQualityMin,
    stableFrameCount,
    screenCenterDelta,
    screenCenterSpread: windowMetrics.screenCenterSpread,
    screenCenterSpreadMax: windowMetrics.screenCenterSpreadMax,
    cameraDistance: projection.cameraDistance,
    cameraDistanceDelta,
    cameraDistanceSpread: windowMetrics.cameraDistanceSpread,
    normalAngularSpreadRad: windowMetrics.normalAngularSpreadRad,
    positionStability,
    rotationStability,
    screenStability,
    depthStability,
    normalStability,
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
      screenCenterDelta: Number(screenCenterDelta.toFixed(5)),
      screenCenterSpread: Number(windowMetrics.screenCenterSpread.toFixed(5)),
      screenStability: Number(screenStability.toFixed(3)),
      cameraDistanceSpread: Number(windowMetrics.cameraDistanceSpread.toFixed(4)),
      depthStability: Number(depthStability.toFixed(3)),
      normalAngularSpreadRad: Number(windowMetrics.normalAngularSpreadRad.toFixed(4)),
      normalStability: Number(normalStability.toFixed(3)),
      positionSpreadRaw: Number(windowMetrics.positionSpreadRaw.toFixed(3)),
      positionStability: Number(positionStability.toFixed(3)),
      consensusProgress: Number(consensusProgress.toFixed(3)),
      windowStableEnough,
      stableEnough,
    });
  }

  return diagnostics;
}
