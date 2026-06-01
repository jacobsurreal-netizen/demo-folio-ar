import './Hud.css';
import { useAppState } from '../hooks/use-app-state';
import { useParallax } from '../hooks/use-parallax';
import { HUD_TOKENS } from './hud-tokens';
import { StatusBar } from './StatusBar';
import { Reticle } from './Reticle';
import { HudFrame } from './HudFrame';
import { AnalysisPanel } from './AnalysisPanel';
import { GatewayAction } from './GatewayAction';
import { arStore } from '../state/store';

export function Hud() {
  const { hudMode } = useAppState();
  const parallax = useParallax();

  const toggleMode = () => {
    const newMode = hudMode === 'COLOR' ? 'IR' : 'COLOR';
    arStore.setState({ hudMode: newMode });
    // Optionally, if you want to ensure data-mode is always in sync, you can trigger a re-render or effect in App
  };

  return (
    <div className="hud-container" style={{ background: 'transparent', pointerEvents: 'none' }}>
      {/* HUD-local IR vignette: visual-only, sits above camera but beneath HUD content */}
      <div className="hud-ir-vignette" aria-hidden="true" />

      <div className="hud-scanlines" />

      <div className="hud-shell">
        {/* Layer 1: Background Grid / Frame (Slowest) */}
        <div
          className="hud-layer"
          style={{
            transform: `translate(${parallax.x * HUD_TOKENS.shared.parallax.grid * 10}px, ${
              parallax.y * HUD_TOKENS.shared.parallax.grid * 10
            }px)`,
          }}
        >
          <HudFrame />
        </div>

        {/* Layer 2: Telemetry & Panels (Medium) */}
        <div
          className="hud-layer"
          style={{
            transform: `translate(${parallax.x * HUD_TOKENS.shared.parallax.telemetry * 10}px, ${
              parallax.y * HUD_TOKENS.shared.parallax.telemetry * 10
            }px)`,
          }}
        >
          <StatusBar />
          <AnalysisPanel />
          <Reticle />
        </div>

        {/* Layer 3: Controls & CTA (Fastest) */}
        <div
          className="hud-layer hud-interactive"
          style={{
            transform: `translate(${parallax.x * HUD_TOKENS.shared.parallax.controls * 10}px, ${
              parallax.y * HUD_TOKENS.shared.parallax.controls * 10
            }px)`
          }}
        >
          <GatewayAction />

          {/* Mode Switcher Floating Button */}
          <button
            onClick={toggleMode}
            className="hud-badge"
            style={{
              position: 'absolute',
              top: '120px',
              right: '20px',
              cursor: 'pointer',
              border: '1px solid var(--hud-accent)'
            }}
          >
            {hudMode} MODE
          </button>
        </div>
      </div>
    </div>
  );
}
