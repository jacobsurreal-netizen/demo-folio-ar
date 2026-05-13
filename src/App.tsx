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
      <ARProvider />

      {/* ── HUD Overlay Layer ── */}
      <Hud />
    </div>
  );
}
