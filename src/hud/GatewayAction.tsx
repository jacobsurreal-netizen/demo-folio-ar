import { useAppState } from '../hooks/use-app-state';
import { GATEWAY_URL } from '../ar/ar-config';

export function GatewayAction() {
  const { tracking } = useAppState();
  const locked = tracking === 'locked';

  const handleOpen = () => {
    window.open(GATEWAY_URL, '_blank');
  };

  return (
    <div className="hud-bottom-bar">
      <div className="hud-status-line">
        [ {tracking === 'locked' ? 'SIGNAL STABLE' : tracking === 'lost' ? 'SIGNAL LOST // REALIGNING' : 'HOLD STEADY // SEARCHING'} ]
      </div>

      {locked && (
        <button className="gateway-button" onClick={handleOpen}>
          OPEN WEB GATEWAY
        </button>
      )}

      <div className="hud-status-line" style={{ opacity: 0.4, marginTop: '8px' }}>
        FIELD DEMO // VERSION 0.1
      </div>
    </div>
  );
}
