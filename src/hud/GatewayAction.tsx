import { useEffect, useRef } from 'react';
import { useAppState } from '../hooks/use-app-state';
import { GATEWAY_URL } from '../ar/ar-config';
import { arStore } from '../state/store';

const AR_SHUTDOWN_EVENT = 'surreal-ar-shutdown-request';
const HANDOFF_DELAY_MS = 150;

export function GatewayAction() {
  const { tracking, resonanceState, stabilizationHold } = useAppState();
  const locked = tracking === 'locked';

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const progressRef = useRef<number>(arStore.getState().stabilizationProgress ?? 0);
  const HOLD_DURATION = 3.0;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, []);

  // Sync progress when tracking changes (re-arm on lost/awaiting)
  useEffect(() => {
    if (tracking !== 'locked') {
      progressRef.current = 0;
    } else {
      progressRef.current = arStore.getState().stabilizationProgress ?? 0;
    }
  }, [tracking]);

  const startHold = (ev: React.PointerEvent) => {
    ev.preventDefault();
    if (!locked) return;
    if ((progressRef.current ?? 0) >= 1) return;
    lastRef.current = performance.now();
    arStore.setState({ resonanceState: 'LOCKING', stabilizationHold: true });

    const tick = (t: number) => {
      const last = lastRef.current ?? t;
      const dt = (t - last) * 0.001;
      lastRef.current = t;
      let next = Math.min(1, (progressRef.current ?? 0) + dt / HOLD_DURATION);
      progressRef.current = next;

      if (next >= 1) {
        arStore.setState({ resonanceState: 'CONFIRMED', stabilizationHold: false, stabilizationProgress: 1 });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        lastRef.current = null;
        return;
      }

      arStore.setState({ resonanceState: 'LOCKING', stabilizationHold: true, stabilizationProgress: next });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const endHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastRef.current = null;
    arStore.setState({ resonanceState: 'ACQUIRED_UNSTABLE', stabilizationHold: false, stabilizationProgress: progressRef.current });
  };

  const handleOpen = () => {
    window.dispatchEvent(new Event(AR_SHUTDOWN_EVENT));
    window.setTimeout(() => {
      window.location.assign(GATEWAY_URL);
    }, HANDOFF_DELAY_MS);
  };

  return (
    <div className="hud-bottom-bar">
      <div className="hud-status-line">
        [ {tracking === 'locked' ? 'SIGNAL STABLE' : tracking === 'lost' ? 'SIGNAL LOST // REALIGNING' : 'HOLD STEADY // SEARCHING'} ]
      </div>

      {locked && resonanceState === 'CONFIRMED' && (
        <button className="gateway-button gateway-button--active" onClick={handleOpen}>
          OPEN OBSERVATION DECK
        </button>
      )}

      {locked && resonanceState !== 'CONFIRMED' && (
        <button
          className="gateway-button"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
        >
          {stabilizationHold ? 'RESONANCE LOCKING...' : 'HOLD TO STABILIZE_RESONANCE'}
        </button>
      )}

      <div className="hud-status-line" style={{ opacity: 0.4, marginTop: '8px' }}>
        FIELD DEMO // VERSION 0.1
      </div>
    </div>
  );
}
