/**
 * Manifest pose diagnostics — telemetry only.
 *
 * Captures the anchor world pose at first field manifestation, measures live
 * drift, and evaluates manifest health. No render transforms are modified.
 */
import * as THREE from 'three';

/** Tight drift band for legacy `manifestDriftStable` flag. */
export const MANIFEST_POSITION_DRIFT_STABLE = 0.015;
export const MANIFEST_ROTATION_DRIFT_STABLE = 0.06;

/** Manifest health thresholds — tune on device. */
export const MANIFEST_POSITION_DRIFT_WARN = 80;
export const MANIFEST_POSITION_DRIFT_BAD = 500;
export const MANIFEST_ROTATION_DRIFT_WARN_RAD = 0.1;
export const MANIFEST_ROTATION_DRIFT_BAD_RAD = 0.28;
export const MANIFEST_UNHEALTHY_HOLD_MS = 800;

export type ManifestHealth = 'HEALTHY' | 'WAVERING' | 'REALIGN_REQUIRED';

export interface ManifestHealthContext {
  fieldLockCandidate?: boolean;
  gateScreenStability?: number;
  gateNormalStability?: number;
  gateDepthStability?: number;
}

export interface ManifestPoseDiagnostics {
  manifestAgeMs: number;
  manifestPositionDrift: number;
  manifestRotationDriftRad: number;
  manifestDriftStable: boolean;
  manifestHealth: ManifestHealth;
  manifestUnhealthyAgeMs: number;
  manifestHealthReasons: string[];
}

export interface ManifestPoseSnapshot {
  manifestCaptured: boolean;
  diagnostics: ManifestPoseDiagnostics | null;
}

let manifestCaptured = false;
let manifestCapturedAtMs: number | null = null;
let unhealthyStartedAtMs: number | null = null;
let latestDiagnostics: ManifestPoseDiagnostics | null = null;

const manifestWorldPos = new THREE.Vector3();
const manifestWorldQuat = new THREE.Quaternion();
const tmpLivePos = new THREE.Vector3();
const tmpLiveQuat = new THREE.Quaternion();

function createInitialDiagnostics(): ManifestPoseDiagnostics {
  return {
    manifestAgeMs: 0,
    manifestPositionDrift: 0,
    manifestRotationDriftRad: 0,
    manifestDriftStable: true,
    manifestHealth: 'HEALTHY',
    manifestUnhealthyAgeMs: 0,
    manifestHealthReasons: [],
  };
}

function evaluateManifestHealth(
  now: number,
  manifestPositionDrift: number,
  manifestRotationDriftRad: number,
  context?: ManifestHealthContext,
): {
  manifestHealth: ManifestHealth;
  manifestUnhealthyAgeMs: number;
  manifestHealthReasons: string[];
} {
  const reasons: string[] = [];

  const positionWarn = manifestPositionDrift > MANIFEST_POSITION_DRIFT_WARN;
  const positionBad = manifestPositionDrift > MANIFEST_POSITION_DRIFT_BAD;
  const rotationWarn = manifestRotationDriftRad > MANIFEST_ROTATION_DRIFT_WARN_RAD;
  const rotationBad = manifestRotationDriftRad > MANIFEST_ROTATION_DRIFT_BAD_RAD;

  const gateScreenUnstable =
    typeof context?.gateScreenStability === 'number' && context.gateScreenStability < 0.65;
  const gateNormalUnstable =
    typeof context?.gateNormalStability === 'number' && context.gateNormalStability < 0.8;
  const gateDepthUnstable =
    typeof context?.gateDepthStability === 'number' && context.gateDepthStability < 0.7;
  const gateUnstable = gateScreenUnstable || gateNormalUnstable || gateDepthUnstable;
  const candidateFalse = context?.fieldLockCandidate === false;

  if (positionBad) {
    reasons.push(
      `positionDrift ${manifestPositionDrift.toFixed(1)} > BAD ${MANIFEST_POSITION_DRIFT_BAD} (ref)`,
    );
  } else if (positionWarn) {
    reasons.push(
      `positionDrift ${manifestPositionDrift.toFixed(1)} > WARN ${MANIFEST_POSITION_DRIFT_WARN} (ref)`,
    );
  }

  if (rotationBad) {
    reasons.push(
      `rotationDrift ${manifestRotationDriftRad.toFixed(3)} > BAD ${MANIFEST_ROTATION_DRIFT_BAD_RAD}`,
    );
  } else if (rotationWarn) {
    reasons.push(
      `rotationDrift ${manifestRotationDriftRad.toFixed(3)} > WARN ${MANIFEST_ROTATION_DRIFT_WARN_RAD}`,
    );
  }

  if (candidateFalse) {
    reasons.push('fieldLockCandidate false after manifestation');
  }

  if (gateScreenUnstable) {
    reasons.push(`gateScreenStability ${context?.gateScreenStability?.toFixed(3)} < 0.65`);
  }

  if (gateNormalUnstable) {
    reasons.push(`gateNormalStability ${context?.gateNormalStability?.toFixed(3)} < 0.80`);
  }

  if (gateDepthUnstable) {
    reasons.push(`gateDepthStability ${context?.gateDepthStability?.toFixed(3)} < 0.70`);
  }

  // Raw position drift alone is reference-only — never a hard realign trigger.
  const realignTrigger =
    rotationBad ||
    (candidateFalse && gateUnstable) ||
    (positionBad && (rotationBad || rotationWarn || gateUnstable || candidateFalse));

  let manifestUnhealthyAgeMs = 0;

  if (realignTrigger) {
    if (unhealthyStartedAtMs === null) {
      unhealthyStartedAtMs = now;
    }
    manifestUnhealthyAgeMs = now - unhealthyStartedAtMs;
  } else {
    unhealthyStartedAtMs = null;
  }

  let manifestHealth: ManifestHealth;

  if (realignTrigger && manifestUnhealthyAgeMs >= MANIFEST_UNHEALTHY_HOLD_MS) {
    manifestHealth = 'REALIGN_REQUIRED';
    reasons.push(
      `unhealthyAgeMs ${Math.round(manifestUnhealthyAgeMs)} > ${MANIFEST_UNHEALTHY_HOLD_MS}`,
    );
  } else if (positionWarn || positionBad || rotationWarn || rotationBad || reasons.length > 0) {
    manifestHealth = 'WAVERING';
  } else {
    manifestHealth = 'HEALTHY';
  }

  return {
    manifestHealth,
    manifestUnhealthyAgeMs,
    manifestHealthReasons: reasons,
  };
}

export function captureManifestPose(anchor: THREE.Object3D): void {
  manifestCapturedAtMs = performance.now();
  unhealthyStartedAtMs = null;
  anchor.getWorldPosition(manifestWorldPos);
  anchor.getWorldQuaternion(manifestWorldQuat);
  manifestCaptured = true;
  latestDiagnostics = createInitialDiagnostics();
}

export function resetManifestPose(): void {
  manifestCaptured = false;
  manifestCapturedAtMs = null;
  unhealthyStartedAtMs = null;
  latestDiagnostics = null;
}

export function getManifestPoseSnapshot(): ManifestPoseSnapshot {
  return {
    manifestCaptured,
    diagnostics: manifestCaptured ? latestDiagnostics : null,
  };
}

export function sampleManifestPoseDrift(
  anchor: THREE.Object3D,
  context?: ManifestHealthContext,
): ManifestPoseDiagnostics | null {
  if (!manifestCaptured || manifestCapturedAtMs === null) {
    return null;
  }

  const now = performance.now();
  anchor.getWorldPosition(tmpLivePos);
  anchor.getWorldQuaternion(tmpLiveQuat);

  const manifestAgeMs = now - manifestCapturedAtMs;
  const manifestPositionDrift = tmpLivePos.distanceTo(manifestWorldPos);
  const manifestRotationDriftRad = manifestWorldQuat.angleTo(tmpLiveQuat);
  const manifestDriftStable =
    manifestPositionDrift <= MANIFEST_POSITION_DRIFT_STABLE &&
    manifestRotationDriftRad <= MANIFEST_ROTATION_DRIFT_STABLE;

  const health = evaluateManifestHealth(
    now,
    manifestPositionDrift,
    manifestRotationDriftRad,
    context,
  );

  const diagnostics: ManifestPoseDiagnostics = {
    manifestAgeMs,
    manifestPositionDrift,
    manifestRotationDriftRad,
    manifestDriftStable,
    manifestHealth: health.manifestHealth,
    manifestUnhealthyAgeMs: health.manifestUnhealthyAgeMs,
    manifestHealthReasons: health.manifestHealthReasons,
  };

  latestDiagnostics = diagnostics;
  return diagnostics;
}
