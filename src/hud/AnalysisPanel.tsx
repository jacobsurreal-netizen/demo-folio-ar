export function AnalysisPanel() {
  const data = [
    { label: 'FREQ', val: '440.12 HZ' },
    { label: 'AMP', val: '-12.4 DB' },
    { label: 'PHASE', val: '98.1 %' },
    { label: 'TEMP', val: '41.2 °C' }
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
