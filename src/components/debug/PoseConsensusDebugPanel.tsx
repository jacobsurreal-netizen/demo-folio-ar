import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  getPoseConsensusSnapshot,
  type PoseConsensusSnapshot,
} from '../../ar/ar-pose-consensus';
import { useAppState } from '../../hooks/use-app-state';

const UI_POLL_MS = 250;
const TRIPLE_TAP_WINDOW_MS = 900;
const TRIPLE_TAP_COUNT = 3;

const PANEL_STYLE: CSSProperties = {
  position: 'fixed',
  top: '12px',
  left: '12px',
  right: '12px',
  maxWidth: '380px',
  zIndex: 250,
  pointerEvents: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '10px',
  lineHeight: 1.4,
  color: '#5eead4',
  background: 'rgba(0, 12, 18, 0.82)',
  border: '1px solid rgba(45, 212, 191, 0.35)',
  borderRadius: '6px',
  padding: '10px 12px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  backdropFilter: 'blur(4px)',
};

const GESTURE_ZONE_STYLE: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  right: 0,
  width: '96px',
  height: '96px',
  zIndex: 251,
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  background: 'transparent',
};

function formatMetric(value: number, digits: number): string {
  return value.toFixed(digits);
}

function renderSnapshot(
  snapshot: PoseConsensusSnapshot,
  tracking: string,
  resonanceState: string,
): string[] {
  const { glyphDetected, diagnostics } = snapshot;
  const lines = [
    'POSE CONSENSUS DEBUG',
    `glyphDetected: ${glyphDetected ? 'true' : 'false'}`,
    `observing: ${glyphDetected ? (diagnostics ? 'active' : 'waiting') : 'idle'}`,
    `tracking: ${tracking}`,
    `resonanceState: ${resonanceState}`,
  ];

  if (!glyphDetected || !diagnostics) {
    lines.push('— no live samples —');
    return lines;
  }

  lines.push(
    '— frame —',
    `framePositionDelta: ${formatMetric(diagnostics.framePositionDelta, 3)}`,
    `frameAngularDeltaRad: ${formatMetric(diagnostics.frameAngularDeltaRad, 4)}`,
    `viewpointQuality: ${formatMetric(diagnostics.viewpointQuality, 3)}`,
    '— window raw —',
    `windowSampleCount: ${diagnostics.windowSampleCount}`,
    `windowAgeMs: ${Math.round(diagnostics.windowAgeMs)}`,
    `positionSpreadRaw: ${formatMetric(diagnostics.positionSpreadRaw, 3)}`,
    `positionSpreadMaxRaw: ${formatMetric(diagnostics.positionSpreadMaxRaw, 3)}`,
    `rotationSpreadRad: ${formatMetric(diagnostics.rotationSpreadRad, 4)}`,
    `viewpointQualityAvg: ${formatMetric(diagnostics.viewpointQualityAvg, 3)}`,
    `viewpointQualityMin: ${formatMetric(diagnostics.viewpointQualityMin, 3)}`,
    `stableFrameCount: ${diagnostics.stableFrameCount}`,
    '— projected —',
    `screenCenterDelta: ${formatMetric(diagnostics.screenCenterDelta, 5)}`,
    `screenCenterSpread: ${formatMetric(diagnostics.screenCenterSpread, 5)}`,
    `screenCenterSpreadMax: ${formatMetric(diagnostics.screenCenterSpreadMax, 5)}`,
    `screenStability: ${formatMetric(diagnostics.screenStability, 3)}`,
    `cameraDistance: ${formatMetric(diagnostics.cameraDistance, 3)}`,
    `cameraDistanceDelta: ${formatMetric(diagnostics.cameraDistanceDelta, 4)}`,
    `cameraDistanceSpread: ${formatMetric(diagnostics.cameraDistanceSpread, 4)}`,
    `depthStability: ${formatMetric(diagnostics.depthStability, 3)}`,
    `normalAngularSpreadRad: ${formatMetric(diagnostics.normalAngularSpreadRad, 4)}`,
    `normalStability: ${formatMetric(diagnostics.normalStability, 3)}`,
    '— gate candidate —',
    `consensusProgress: ${formatMetric(diagnostics.consensusProgress, 3)}`,
    `fieldLockCandidate: ${diagnostics.fieldLockCandidate ? 'true' : 'false'}`,
    `projectedStableFrameCount: ${diagnostics.projectedStableFrameCount}`,
    ...(diagnostics.fieldLockRejectReasons.length > 0
      ? diagnostics.fieldLockRejectReasons.map((reason) => `reject: ${reason}`)
      : ['reject: none']),
    '— legacy —',
    `windowStableEnough: ${diagnostics.windowStableEnough ? 'true' : 'false'}`,
    `stableEnough: ${diagnostics.stableEnough ? 'true' : 'false'}`,
    `positionStability(raw): ${formatMetric(diagnostics.positionStability, 3)}`,
    `rotationStability: ${formatMetric(diagnostics.rotationStability, 3)}`,
    `observationAgeMs: ${Math.round(diagnostics.observationAgeMs)}`,
    `sampleCount: ${diagnostics.sampleCount}`,
  );

  return lines;
}

export function PoseConsensusDebugPanel() {
  const { tracking, resonanceState } = useAppState();
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<PoseConsensusSnapshot>(() => getPoseConsensusSnapshot());
  const tapTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!visible) return;

    setSnapshot(getPoseConsensusSnapshot());
    const intervalId = window.setInterval(() => {
      setSnapshot(getPoseConsensusSnapshot());
    }, UI_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [visible]);

  const handleGesturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const now = performance.now();
    const recentTaps = tapTimesRef.current.filter((tapTime) => now - tapTime <= TRIPLE_TAP_WINDOW_MS);
    recentTaps.push(now);
    tapTimesRef.current = recentTaps;

    if (recentTaps.length >= TRIPLE_TAP_COUNT) {
      setVisible((current) => !current);
      tapTimesRef.current = [];
    }
  };

  const lines = renderSnapshot(snapshot, tracking, resonanceState);

  return (
    <>
      <div
        role="presentation"
        aria-hidden
        style={GESTURE_ZONE_STYLE}
        onPointerDown={handleGesturePointerDown}
      />

      {visible && (
        <div role="status" aria-live="polite" style={PANEL_STYLE}>
          {lines.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
          <div style={{ marginTop: '8px', opacity: 0.55, color: '#86efac' }}>
            triple-tap bottom-right to hide
          </div>
        </div>
      )}
    </>
  );
}
