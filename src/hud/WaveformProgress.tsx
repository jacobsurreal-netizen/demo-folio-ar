import { useMemo } from 'react';
import { useAppState } from '../hooks/use-app-state';

export function WaveformProgress() {
  const { tracking, resonanceState, stabilizationProgress, hudMode } = useAppState();

  const visible = tracking === 'locked';

  const accent = hudMode === 'IR' ? '#ffd66b' : '#3dd9c8';

  const label = useMemo(() => {
    switch (resonanceState) {
      case 'ACQUIRED_UNSTABLE':
        return 'SIGNAL DRIFT';
      case 'LOCKING':
        return 'FIELD ALIGNMENT';
      case 'CONFIRMED':
        return 'RESONANCE STABLE';
      case 'LOST':
        return 'SIGNAL LOST';
      default:
        return '';
    }
  }, [resonanceState]);

  // Derived visual state classes
  const stateClass = resonanceState === 'ACQUIRED_UNSTABLE'
    ? 'state-acquired'
    : resonanceState === 'LOCKING'
    ? 'state-locking'
    : resonanceState === 'CONFIRMED'
    ? 'state-confirmed'
    : resonanceState === 'LOST'
    ? 'state-lost'
    : 'state-searching';

  return (
    <div
      className={`waveform-hud ${stateClass}`}
      aria-hidden
      style={{
        // CSS variable for accent color and compact opacity when not locked
        ['--wave-accent' as any]: accent,
        opacity: visible ? 1 : 0.12,
        pointerEvents: 'none',
      }}
    >
      <svg className="waveform-svg" viewBox="0 0 200 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wfGrad" x1="0" x2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.98" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path className="waveform-line" d="M0 20 C 20 8, 40 32, 60 20 C 80 8, 100 32, 120 20 C 140 8, 160 32, 180 20 C 195 16, 200 20, 200 20" fill="none" stroke="url(#wfGrad)" strokeWidth="2" strokeLinecap="round" />

        {/* progress overlay: scaled rect that grows left->right */}
        <rect className="waveform-progress-fill" x="0" y="28" width="200" height="4" rx="2" fill={accent} transform={`scale(${Math.max(0, Math.min(1, stabilizationProgress ?? 0))},1)`} transform-origin="0 0" />
      </svg>

      <div className="waveform-label">{label}</div>
    </div>
  );
}

export default WaveformProgress;
