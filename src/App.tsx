/**
 * SURREAL EXP LAB // DEMO V1
 * Root compositor.
 *
 * Owns the top-level layout: AR canvas container + HUD overlay.
 * Sets the data-mode attribute on the root for CSS variable switching.
 * Does NOT contain business logic — delegates to child layers.
 */

import { useAppState } from './hooks/use-app-state';
import { ARProvider } from './ar/ar-provider';
import { Hud } from './hud/Hud';

export function App() {
  const { hudMode } = useAppState();

  return (
    <div className="app-root" data-mode={hudMode}>
      {/* ── AR Scene Layer ── */}
      <div className="ar-canvas-root" style={{ position: 'absolute', inset: 0, zIndex: 'var(--z-ar-canvas)' }}>
        <ARProvider />
      </div>

      {/* ── IR/COLOR camera diffuser layer (visual-only, below HUD) ── */}
      <div className="ar-mode-filter" aria-hidden="true" />

      {/* ── HUD Overlay Layer ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 'var(--z-hud-interactive)', pointerEvents: 'none' }}>
        <Hud />
      </div>
    </div>
  );
}
