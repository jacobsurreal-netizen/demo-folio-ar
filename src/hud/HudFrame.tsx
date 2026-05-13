export function HudFrame() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 390 844">
      {/* Outer segmented border */}
      <path d="M60 2 L330 2" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M2 60 L2 784" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M388 60 L388 784" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M60 842 L330 842" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />

      {/* Rounded corners */}
      <path d="M2 60 Q2 2 60 2" fill="none" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M330 2 Q388 2 388 60" fill="none" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M2 784 Q2 842 60 842" fill="none" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />
      <path d="M330 842 Q388 842 388 784" fill="none" stroke="var(--hud-accent)" strokeWidth="0.8" style={{ opacity: 0.4 }} />

      {/* Side ticks */}
      {Array.from({ length: 14 }).map((_, i) => (
        <g key={i}>
          <line
            x1="2" y1={150 + i * 40}
            x2={i % 3 === 0 ? 12 : 6} y2={150 + i * 40}
            stroke="var(--hud-accent)" strokeWidth="0.6" style={{ opacity: 0.3 }}
          />
          <line
            x1="388" y1={150 + i * 40}
            x2={i % 3 === 0 ? 378 : 384} y2={150 + i * 40}
            stroke="var(--hud-accent)" strokeWidth="0.6" style={{ opacity: 0.3 }}
          />
        </g>
      ))}

      {/* Bottom center split */}
      <rect x="180" y="840" width="30" height="4" fill="var(--hud-bg)" />
      <line x1="195" y1="838" x2="195" y2="844" stroke="var(--hud-accent)" strokeWidth="1" style={{ opacity: 0.6 }} />
    </svg>
  );
}
