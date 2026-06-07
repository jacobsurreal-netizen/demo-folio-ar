import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../hooks/use-app-state';

// Deterministic chaotic frequency samples (display-only)
const CHAOTIC_FREQ_VALUES = [
  '312.04 Hz',
  '440.12 Hz',
  '420.67 Hz',
  '▋69.?? Hz',
  '087.91 Hz',
  'CHA0.7 Hz',
  'ERR.Δ Hz'
];

export function AnalysisPanel() {
  const { tracking, resonanceState } = useAppState();

  // Timer-driven index for chaotic display when in ACQUIRED_UNSTABLE (250-600ms cadence)
  const [chaosIndex, setChaosIndex] = useState(0);
  useEffect(() => {
    if (resonanceState !== 'ACQUIRED_UNSTABLE') return undefined;
    const interval = setInterval(() => {
      setChaosIndex((i) => (i + 1) % CHAOTIC_FREQ_VALUES.length);
    }, 450);
    return () => clearInterval(interval);
  }, [resonanceState]);

  // Local mapper: produce display values without touching global state
  const telemetry = useMemo(() => {
    // Default SEARCHING/LOST state when tracking not locked
    if (tracking !== 'locked') {
      return {
        freq: '---.-- Hz',
        signal: tracking === 'lost' ? 'LOST' : 'UNKNOWN',
        lock: tracking === 'lost' ? 'BROKEN' : 'NONE',
        noise: 'HIGH',
      };
    }

    // When artifact detected but resonance not stabilized
    if (resonanceState === 'ACQUIRED_UNSTABLE') {
      return {
        freq: CHAOTIC_FREQ_VALUES[chaosIndex],
        signal: 'UNSTABLE',
        lock: 'ERRATIC',
        noise: 'OFF SCALE',
      };
    }

    // User is holding / aligning to lock
    if (resonanceState === 'LOCKING') {
      return {
        freq: 'TUNING...',
        signal: 'SYNTONIZING',
        lock: 'LOCKING',
        noise: 'REDUCING',
      };
    }

    // Final confirmed resonance
    if (resonanceState === 'CONFIRMED') {
      return {
        freq: '369.99 Hz',
        signal: 'STRONG',
        lock: 'CONFIRMED',
        noise: 'LOW',
      };
    }

    // Explicit lost resonance state
    if (resonanceState === 'LOST') {
      return {
        freq: '---.-- Hz',
        signal: 'LOST',
        lock: 'BROKEN',
        noise: 'HIGH',
      };
    }

    // Fallback: artifact detected but unknown substate
    return {
      freq: '---.-- Hz',
      signal: 'UNKNOWN',
      lock: 'NONE',
      noise: 'HIGH',
    };
  }, [tracking, resonanceState, chaosIndex]);

  const data = [
    { label: 'FREQ', val: telemetry.freq },
    { label: 'SIGNAL', val: telemetry.signal },
    { label: 'LOCK', val: telemetry.lock },
    { label: 'NOISE', val: telemetry.noise }
  ];

  return (
    <div className="telemetry-group" style={{ maxWidth: '80px', marginTop: '175px', marginLeft: '20px' }}>
      <span className="hud-label" style={{ opacity: 0.6, letterSpacing: '0.3em' }}>ANALYSIS</span>
      <div style={{ height: '1px', background: 'var(--hud-accent)', opacity: 0.3, margin: '4px 0' }} />
      {data.map((item) => (
        <div key={item.label} style={{ marginBottom: '8px' }}>
          <div className="hud-label" style={{ fontSize: '7px', opacity: 0.4 }}>{item.label}</div>
          <div className="hud-value" style={{ fontSize: '9px', fontWeight: 500 }}>{item.val}</div>
        </div>
      ))}
    </div>
  );
}
