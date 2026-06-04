import { useAppState } from '../hooks/use-app-state';

export function Reticle() {
  const { tracking } = useAppState();
  const locked = tracking === 'locked';

  return (
    <div className="reticle-anchor">
    <div className={`reticle-container reticle-state-${tracking}`}>
      <svg viewBox="0 0 300 300" className="w-full h-full">
        {/* Outer segmented ring */}
        <g className="reticle-ring">
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 360) / 24;
            const r = 120;
            const cx = 150;
            const cy = 150;
            const gap = 3;
            const s = ((angle - 90) * Math.PI) / 180;
            const e = ((angle + 360 / 24 - gap - 90) * Math.PI) / 180;
            const x1 = cx + r * Math.cos(s);
            const y1 = cy + r * Math.sin(s);
            const x2 = cx + r * Math.cos(e);
            const y2 = cy + r * Math.sin(e);

            return (
              <path
                key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke="var(--hud-accent)"
                strokeWidth={locked ? 1.5 : 0.8}
                style={{ opacity: locked ? 0.7 : 0.3, transition: 'all 0.4s ease' }}
              />
            );
          })}
        </g>

        {/* Inner rings */}
        <circle
          cx="150"
          cy="150"
          r="90"
          fill="none"
          stroke="var(--hud-accent)"
          strokeWidth="0.5"
          strokeDasharray="4 8"
          style={{ opacity: 0.2 }}
        />
        <circle
          cx="150"
          cy="150"
          r="60"
          fill="none"
          stroke="var(--hud-accent)"
          strokeWidth="0.5"
          style={{ opacity: 0.15 }}
        />

        {/* Crosshairs */}
        <line x1="150" y1="20" x2="150" y2="50" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.5 }} />
        <line x1="150" y1="250" x2="150" y2="280" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.5 }} />
        <line x1="20" y1="150" x2="50" y2="150" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.5 }} />
        <line x1="250" y1="150" x2="280" y2="150" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.5 }} />

        {/* Center Focal Point */}
        <circle cx="150" cy="150" r="3" fill="var(--hud-accent)" style={{ opacity: locked ? 0.9 : 0.4 }} />
        <circle cx="150" cy="150" r="8" fill="none" stroke="var(--hud-accent)" strokeWidth="0.5" style={{ opacity: 0.3 }} />
      </svg>
    </div>
    </div>
  );
}
