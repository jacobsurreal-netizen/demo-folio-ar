import { useEffect, useState } from 'react';
import { useAppState } from '../hooks/use-app-state';

export function StatusBar() {
  const { tracking, resonanceState } = useAppState();
  const [tc, setTc] = useState('00:00:00:00');

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const totalFrames = Math.floor(elapsed / (1000 / 25));
      const frames = String(totalFrames % 25).padStart(2, '0');
      const seconds = String(Math.floor(totalFrames / 25) % 60).padStart(2, '0');
      const minutes = String(Math.floor(totalFrames / (25 * 60)) % 60).padStart(2, '0');
      const hours = String(Math.floor(totalFrames / (25 * 3600)) % 24).padStart(2, '0');
      setTc(`${hours}:${minutes}:${seconds}:${frames}`);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hud-top-bar">
      <div className="telemetry-group">
        <span className="hud-label">
          PROBE_STATE: {tracking === 'locked' ? 'NOMINAL' : tracking === 'lost' ? 'UNSTABLE' : 'SCANNING'}
        </span>
        <span className="hud-label">
          TARGET_LINK: {
            tracking !== 'locked' ? (tracking === 'lost' ? 'SEARCHING' : 'SEARCHING') :
            resonanceState === 'ACQUIRED_UNSTABLE' ? 'WAVERING' :
            resonanceState === 'LOCKING' ? 'ALIGNING' :
            resonanceState === 'CONFIRMED' ? 'STABLE' :
            'UNKNOWN'
          }
        </span>
        <div className="hud-badge" style={{ marginTop: '8px' }}>
          {resonanceState === 'CONFIRMED' ? 'RESONANCE CONFIRMED' : tracking === 'locked' ? 'ARTIFACT DETECTED' : 'AWAITING LOCK'}
        </div>
      </div>

      <div className="telemetry-group" style={{ alignItems: 'flex-end' }}>
        <span className="hud-label">UTC_TC</span>
        <span className="hud-value tabular-nums">{tc}</span>
        <span className="hud-label" style={{ marginTop: '4px' }}>
          FIELD_ZONE: {tracking === 'locked' ? 'ARTIFACT' : tracking === 'lost' ? 'REALIGN' : 'MARKER'}
        </span>
      </div>
    </div>
  );
}
