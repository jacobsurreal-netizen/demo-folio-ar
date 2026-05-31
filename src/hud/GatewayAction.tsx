import { useAppState } from '../hooks/use-app-state';
import { GATEWAY_URL } from '../ar/ar-config';

const AR_SHUTDOWN_EVENT = 'surreal-ar-shutdown-request';
const HANDOFF_DELAY_MS = 150;

export function GatewayAction() {
  const { tracking } = useAppState();
  const locked = tracking === 'locked';

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

      {locked && (
        <button className="gateway-button gateway-button--active" onClick={handleOpen}>
          OPEN OBSERVATION DECK
        </button>
      )}

      <div className="hud-status-line" style={{ opacity: 0.4, marginTop: '8px' }}>
        FIELD DEMO // VERSION 0.1
      </div>
    </div>
  );
}
