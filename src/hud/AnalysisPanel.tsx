import { useAppState } from '../hooks/use-app-state';

export function AnalysisPanel() {
  const { tracking } = useAppState();

  const freq = tracking === 'locked' ? '369.99 Hz' : '---.-- Hz';

  const data = tracking === 'locked' ? [
    { label: 'FREQ', val: freq },
    { label: 'SIGNAL', val: 'STABLE' },
    { label: 'LOCK', val: 'CONFIRMED' },
    { label: 'NOISE', val: 'LOW' }
  ] : tracking === 'lost' ? [
    { label: 'FREQ', val: freq },
    { label: 'SIGNAL', val: 'LOST' },
    { label: 'LOCK', val: 'BROKEN' },
    { label: 'NOISE', val: 'HIGH' }
  ] : [
    { label: 'FREQ', val: freq },
    { label: 'SIGNAL', val: 'SEARCHING' },
    { label: 'LOCK', val: 'NONE' },
    { label: 'NOISE', val: 'HIGH' }
  ];

  return (
    <div className="telemetry-group" style={{ maxWidth: '80px', marginTop: '140px', marginLeft: '20px' }}>
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
