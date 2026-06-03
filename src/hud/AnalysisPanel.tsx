import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../hooks/use-app-state';

const CHAOTIC_FREQ_VALUES = [
  '312.04 Hz',
  '440.12 Hz',
  '369.?? Hz',
  '087.91 Hz',
  'CH/0.7 Hz',
  'ERR.Δ Hz',
  '420.-- Hz',
  '▁69.?? Hz'
];

export function AnalysisPanel() {
  const { tracking, resonanceState } = useAppState();

  const [chaoticFreq, setChaoticFreq] = useState<string>(CHAOTIC_FREQ_VALUES[0]);
  const idxRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Only run chaotic cycling when in ACQUIRED_UNSTABLE
    if (resonanceState === 'ACQUIRED_UNSTABLE' && tracking === 'locked') {
      idxRef.current = 0;
      setChaoticFreq(CHAOTIC_FREQ_VALUES[0]);
      // cycle every ~370ms
      intervalRef.current = window.setInterval(() => {
        idxRef.current = (idxRef.current + 1) % CHAOTIC_FREQ_VALUES.length;
        setChaoticFreq(CHAOTIC_FREQ_VALUES[idxRef.current]);
      }, 370);
      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      };
    }

    // ensure interval cleared when leaving unstable
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return;
  }, [resonanceState, tracking]);

  // Determine display values according to requested mapping
  let freq = '---.-- Hz';
  let targetLink = 'UNKNOWN';
  let signal = tracking === 'lost' ? 'LOST' : 'SEARCHING';
  let lock = 'NONE';
  let noise = 'HIGH';

  if (resonanceState === 'ACQUIRED_UNSTABLE' && tracking === 'locked') {
    freq = chaoticFreq;
    targetLink = 'WAVERING';
    signal = 'UNSTABLE';
    lock = 'ERRATIC';
    noise = 'OFF SCALE';
  } else if (resonanceState === 'LOCKING' && tracking === 'locked') {
    freq = 'TUNING...';
    targetLink = 'ALIGNING';
    signal = 'SYNTONIZING';
    lock = 'LOCKING';
    noise = 'REDUCING';
  } else if (resonanceState === 'CONFIRMED' && tracking === 'locked') {
    freq = '369.99 Hz';
    targetLink = 'STABLE';
    signal = 'STRONG';
    lock = 'CONFIRMED';
    noise = 'LOW';
  } else if (tracking === 'lost' || resonanceState === 'LOST') {
    freq = '---.-- Hz';
    targetLink = 'UNKNOWN';
    signal = 'SEARCHING';
    lock = 'NONE';
    noise = 'HIGH';
  }

  const data = [
    { label: 'FREQ', val: freq },
    { label: 'TARGET_LINK', val: targetLink },
    { label: 'SIGNAL', val: signal },
    { label: 'LOCK', val: lock },
    { label: 'NOISE', val: noise }
  ];

  return (
    <div className="telemetry-group" style={{ maxWidth: '92px', marginTop: '140px', marginLeft: '20px' }}>
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
