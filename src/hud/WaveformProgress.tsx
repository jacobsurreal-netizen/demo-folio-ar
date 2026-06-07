import { useMemo } from 'react';
import { useAppState } from '../hooks/use-app-state';

/*
  Faithful port of Magic reference's CircularMonitor (Variant 2)
  + SignalRail (Variant 4) combined into a compact hybrid HUD element.

  Notes:
  - Deterministic pseudo-random noise is used (no Math.random() in render loops).
  - CSS animations drive rotation/scanline for unstable states; progress-driven positions used for LOCKING.
  - Component is read-only and uses pointer-events: none via CSS/inline styles.
*/

const PRNG = (n: number) => {
  // deterministic pseudo-random function based on sine hash
  return Math.abs(Math.sin(n * 12.9898 + 78.233) * 43758.5453) % 1;
};

export function WaveformProgress() {
  const { tracking, resonanceState, stabilizationProgress = 0, hudMode } = useAppState();

  const progressPct = Math.max(0, Math.min(100, Math.round(stabilizationProgress * 100)));
  const visible = tracking === 'locked';

  const stateKey = resonanceState || 'LOST';

  // Map labels per Magic reference
  const label = useMemo(() => {
    switch (stateKey) {
      case 'ACQUIRED_UNSTABLE':
        return 'SIGNAL DRIFT';
      case 'LOCKING':
        return 'FIELD ALIGNMENT';
      case 'CONFIRMED':
        return 'RESONANCE STABLE';
      case 'LOST':
      default:
        return 'SIGNAL LOST';
    }
  }, [stateKey]);

  // Palettes from Magic reference
  const palettes = {
    COLOR: { primary: '#00f0ff', dim: '#0a4d5c', text: '#9EF3FF', bg: 'rgba(10,77,92,0.12)' },
    IR: { primary: '#f5a623', dim: '#8b4513', text: '#ffd66b', bg: 'rgba(139,69,19,0.12)' },
  } as const;

  const palette = hudMode === 'IR' ? palettes.IR : palettes.COLOR;

  // ----- Circular ring geometry (based on CircularMonitor) -----
  const RING_RADIUS = 12; // visual radius
  const RING_CENTER = 20;
  const SEGMENTS = 24;

  // Compute segment lengths deterministically
  const ringSegments = useMemo(() => {
    return new Array(SEGMENTS).fill(0).map((_, i) => {
      const baseNoise = PRNG(i + 1);
      let length = 3;
      if (stateKey === 'ACQUIRED_UNSTABLE') {
        length = 2 + baseNoise * 4; // 2..6
      } else if (stateKey === 'LOCKING') {
        length = 3 + (progressPct / 100) * 5 + Math.sin(i * 0.3) * 1;
      } else if (stateKey === 'CONFIRMED') {
        length = 6 + Math.sin(i * 0.5) * 1.5;
      } else if (stateKey === 'LOST') {
        length = 1 + baseNoise * 0.5;
      }
      return Math.max(1, length);
    });
  }, [SEGMENTS, stateKey, progressPct]);

  // Ring progress driven by stabilizationProgress (used directly when rendering)

  // ----- Signal rail geometry (based on SignalRail) -----
  const RAIL_BAR_COUNT = 40;
  const RAIL_W = 280; // viewBox width for SVG
  const RAIL_H = 18;

  const railBars = useMemo(() => {
    return new Array(RAIL_BAR_COUNT).fill(0).map((_, i) => {
      const posPct = (i / RAIL_BAR_COUNT) * 100;
      const noise = PRNG(i + 31);
      let h = 0.2;
      if (stateKey === 'ACQUIRED_UNSTABLE') {
        h = 0.15 + noise * 0.4; // noisy small bars
      } else if (stateKey === 'LOCKING') {
        const dist = Math.abs(posPct - progressPct);
        h = 0.2 + Math.max(0, 0.6 - dist * 0.02);
      } else if (stateKey === 'CONFIRMED') {
        h = 0.5 + Math.sin(i * 0.3) * 0.2;
      } else {
        h = 0.05;
      }
      return Math.max(0.03, Math.min(1, h));
    });
  }, [RAIL_BAR_COUNT, stateKey, progressPct]);

  const stateClass = `state-${stateKey.toLowerCase()}`;

  return (
    <div
      className={`waveform-hud waveform-hud--hybrid ${stateClass}`}
      aria-hidden
      style={{
        ['--rm-primary' as any]: palette.primary,
        ['--rm-dim' as any]: palette.dim,
        ['--rm-text' as any]: palette.text,
        ['--rm-bg' as any]: palette.bg,
        opacity: visible ? 1 : 0.12,
        pointerEvents: 'none',
        // Layout override: nudge the waveform monitor 50px lower (was controlled by CSS bottom:116px)
        bottom: '66px',
      }}
    >
      <svg className="waveform-ring-svg" viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="rm-glow">
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* dim base ring */}
        <circle cx="20" cy="20" r={RING_RADIUS} fill="none" stroke="var(--rm-dim)" strokeWidth="0.6" opacity="0.28" />

        {/* segmented ticks */}
        <g transform={`translate(${RING_CENTER}, ${RING_CENTER})`}>
          {ringSegments.map((len, i) => {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const x1 = Math.cos(angle) * RING_RADIUS;
            const y1 = Math.sin(angle) * RING_RADIUS;
            const x2 = Math.cos(angle) * (RING_RADIUS + len);
            const y2 = Math.sin(angle) * (RING_RADIUS + len);
            // deterministic per-tick delay
            const delay = `${(PRNG(i + 7) * 1.6).toFixed(3)}s`;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="ring-tick"
                stroke="var(--rm-primary)"
                strokeWidth={1}
                opacity={stateKey === 'LOST' ? 0.2 : 0.85}
                filter="url(#rm-glow)"
                strokeLinecap="round"
                style={{ transformOrigin: `${RING_CENTER}px ${RING_CENTER}px`, animationDelay: delay } as any}
              />
            );
          })}
        </g>

        {/* LOCKING radial ring overlay based on progress */}
        {stateKey === 'LOCKING' && (
          <circle
            cx="20"
            cy="20"
            r={RING_RADIUS + (progressPct / 100) * 8}
            fill="none"
            stroke="var(--rm-primary)"
            strokeWidth="0.6"
            opacity="0.32"
          />
        )}

        {/* CONFIRMED center dot */}
        {stateKey === 'CONFIRMED' && <circle cx="20" cy="20" r="3" fill="var(--rm-primary)" opacity={0.95} />}
      </svg>

      <div className="waveform-rail-block">
        <div className="waveform-label">
          <span className="waveform-label-text">{label}</span>
          {stateKey === 'LOCKING' && <span className="waveform-label-percent">{progressPct}%</span>}
        </div>

        <svg className="waveform-rail-svg" viewBox={`0 0 ${RAIL_W} ${RAIL_H}`} width="100%" height="18" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          {/* background */}
          <rect x="0" y="0" width={RAIL_W} height={RAIL_H} fill="var(--rm-bg)" rx="2" />
          <rect x="0" y="0" width={RAIL_W} height={RAIL_H} fill="none" stroke="var(--rm-dim)" strokeWidth="0.5" opacity="0.5" rx="2" />

          <g transform="translate(2,1)">
            {railBars.map((h, i) => {
              const barGap = (RAIL_W - 4) / RAIL_BAR_COUNT;
              const barW = Math.max(1, Math.floor(barGap * 0.45));
              const x = i * barGap;
              const barH = Math.max(1, Math.round(h * (RAIL_H - 2)));
              const y = (RAIL_H - 2) - barH;
              // deterministic group for visual variety
              const driftGroup = i % 3 === 0 ? 'drift-a' : i % 3 === 1 ? 'drift-b' : 'drift-c';
              const baseOpacity = stateKey === 'LOST' ? 0.2 : 0.9;
              const animDelay = stateKey === 'ACQUIRED_UNSTABLE'
                ? `${(PRNG(i + 13) * 1.2).toFixed(3)}s`
                : stateKey === 'CONFIRMED'
                ? `${(PRNG(i + 97) * 0.6).toFixed(3)}s`
                : undefined;

              const classes = ['waveform-rail__bar'];
              if (stateKey === 'ACQUIRED_UNSTABLE') classes.push(driftGroup);
              if (stateKey === 'CONFIRMED') classes.push('confirmed');

              return (
                <rect
                  key={i}
                  className={classes.join(' ')}
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill="var(--rm-primary)"
                  opacity={baseOpacity}
                  style={animDelay ? ({ animationDelay: animDelay } as any) : undefined}
                />
              );
            })}

            {/* scanline: deterministic for LOCKING (position = progress), animated sweep for UNSTABLE */}
            {stateKey === 'LOCKING' && (
              <line
                x1={(progressPct / 100) * (RAIL_W - 4)}
                y1={0}
                x2={(progressPct / 100) * (RAIL_W - 4)}
                y2={RAIL_H - 2}
                stroke="var(--rm-primary)"
                strokeWidth={1}
                opacity={0.6}
              />
            )}
          </g>

          {/* bottom label */}
          <line x1="2" y1={RAIL_H} x2={RAIL_W - 2} y2={RAIL_H} stroke="var(--rm-dim)" strokeWidth="0.5" opacity="0.28" />
          <text x="2" y={RAIL_H + 8} fontSize="6" fill="var(--rm-text)" opacity="0.5" letterSpacing="1">
            RESONANCE MONITOR
          </text>
        </svg>
      </div>
    </div>
  );
}

export default WaveformProgress;
