import './Hud.css';
import { useAppState } from '../hooks/use-app-state';
import { useParallax } from '../hooks/use-parallax';
import { HUD_TOKENS } from './hud-tokens';
import { StatusBar } from './StatusBar';
import { Reticle } from './Reticle';
import { HudFrame } from './HudFrame';
import { AnalysisPanel } from './AnalysisPanel';
import { GatewayAction } from './GatewayAction';
import { WaveformProgress } from './WaveformProgress';
import { arStore } from '../state/store';

export function Hud() {
  const { hudMode, resonanceState, tracking } = useAppState();
  const parallax = useParallax();

  const toggleMode = () => {
    const newMode = hudMode === 'COLOR' ? 'IR' : 'COLOR';
    arStore.setState({ hudMode: newMode });
    // Optionally, if you want to ensure data-mode is always in sync, you can trigger a re-render or effect in App
  };

  // No local hold logic here — GatewayAction owns the bottom action slot.

  return (
    <div className="hud-container" style={{ background: 'transparent', pointerEvents: 'none' }}>
      {/* HUD-local IR vignette: visual-only, sits above camera but beneath HUD content */}
      <div className="hud-ir-vignette" aria-hidden="true" />

      <div className="hud-scanlines" />

      <div className="hud-shell">
        {/* Drag layer: transparent surface used to capture manual rotation gestures when CONFIRMED. */}
        {/* Renders below interactive controls so buttons remain clickable. */}
        <div className="artifact-drag-layer">
          <div
            role="presentation"
            aria-hidden
            className={`artifact-drag-surface ${resonanceState === 'CONFIRMED' && tracking === 'locked' ? 'active' : ''}`}
            onPointerDown={(e) => {
              if (!(resonanceState === 'CONFIRMED' && tracking === 'locked')) return;
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              pointer.current.id = e.pointerId;
              pointer.current.down = true;
              pointer.current.lastX = e.clientX;
              pointer.current.lastY = e.clientY;
              arStore.setState({ artifactRotationActive: true });
            }}
            onPointerMove={(e) => {
              if (!pointer.current.down || e.pointerId !== pointer.current.id) return;
              const dx = e.clientX - pointer.current.lastX;
              const dy = e.clientY - pointer.current.lastY;
              pointer.current.lastX = e.clientX;
              pointer.current.lastY = e.clientY;
              const YAW_SENS = 0.008;
              const PITCH_SENS = 0.006;
              const PITCH_MIN = -0.45;
              const PITCH_MAX = 0.45;
              const state = arStore.getState();
              const prevYaw = state.artifactRotationYaw ?? 0;
              const prevPitch = state.artifactRotationPitch ?? 0;
              const newYaw = prevYaw + dx * YAW_SENS;
              const newPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, prevPitch + dy * PITCH_SENS));
              arStore.setState({ artifactRotationYaw: newYaw, artifactRotationPitch: newPitch });
            }}
            onPointerUp={(e) => {
              if (e.pointerId !== pointer.current.id) return;
              try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
              pointer.current.down = false;
              pointer.current.id = -1;
              arStore.setState({ artifactRotationActive: false });
            }}
            onPointerCancel={(e) => {
              if (e.pointerId !== pointer.current.id) return;
              try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
              pointer.current.down = false;
              pointer.current.id = -1;
              arStore.setState({ artifactRotationActive: false });
            }}
          />
        </div>
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
          {/* Waveform/progress HUD sits visually above the bottom action slot. Non-interactive. */}
          <WaveformProgress />

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
              border: '1px solid var(--hud-accent)',
              zIndex: 999,
              pointerEvents: 'auto'
            }}
          >
            {hudMode} MODE
          </button>
        </div>
      </div>
    </div>
  );
}

// Local pointer tracking ref shared by inline handlers
const pointer: {
  current: { id: number; down: boolean; lastX: number; lastY: number };
} = {
  current: { id: -1, down: false, lastX: 0, lastY: 0 },
};
