/**
 * SURREAL EXP LAB // DEMO V1
 * HUD design tokens — COLOR and IR palettes.
 *
 * Adapted from the main folio's HUD_TOKENS system.
 * Source-of-truth for all HUD color values.
 * The HUD reads mode from AppState, never decides mode itself.
 */

export const HUD_MODES = {
  COLOR: 'COLOR',
  IR: 'IR',
} as const;

export type HudMode = (typeof HUD_MODES)[keyof typeof HUD_MODES];

export const HUD_TOKENS = {
  COLOR: {
    primary: '#00f2ff',
    secondary: '#7ef9ff',
    dim: 'rgba(0, 242, 255, 0.5)',
    faint: 'rgba(0, 242, 255, 0.2)',
    glow: 'rgba(0, 242, 255, 0.12)',
    bg: 'rgba(0, 0, 0, 0.55)',
    text: 'rgba(255, 255, 255, 0.9)',
    textDim: 'rgba(0, 242, 255, 0.6)',
    textFaint: 'rgba(0, 242, 255, 0.3)',
    amber: '#f5a623',
  },
  IR: {
    primary: '#e63030',
    secondary: '#ff6b6b',
    dim: 'rgba(230, 48, 48, 0.5)',
    faint: 'rgba(230, 48, 48, 0.2)',
    glow: 'rgba(230, 48, 48, 0.15)',
    bg: 'rgba(20, 0, 0, 0.65)',
    text: 'rgba(255, 255, 255, 0.9)',
    textDim: 'rgba(230, 48, 48, 0.6)',
    textFaint: 'rgba(230, 48, 48, 0.3)',
    amber: '#f5a623',
  },
  shared: {
    parallax: {
      grid: 0.3,
      telemetry: 0.6,
      controls: 0.9,
    },
    typography: {
      xs: '8px',
      sm: '9px',
      base: '10px',
      lg: '13px',
    },
    transitionMs: 400,
  },
} as const;

export function hudGlow(color: string, px: number): string {
  return `drop-shadow(0 0 ${px}px ${color})`;
}
