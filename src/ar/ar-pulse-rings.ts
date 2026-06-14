import * as THREE from 'three';

export type GravityPulseRingsHandle = {
  root: THREE.Group;
  rings: THREE.Sprite[];
  _resources: {
    mats: THREE.SpriteMaterial[];
    texs: THREE.CanvasTexture[];
  };
  _reveal: {
    active: boolean;
    startedAt: number;
    lastElapsed: number | null;
    visibility: number;
  };
};

// R4 tuning block — marker/artifact-space placement.
// Keep these as separate axis assignments in createGravityPulseRings for easy manual tuning.
const GRAVITY_RINGS_ROOT_OFFSET_X = 0;
const GRAVITY_RINGS_ROOT_OFFSET_Y = 0.2;
const GRAVITY_RINGS_ROOT_OFFSET_Z = 0;

// Local micro-offset for all ring sprites inside the root.
// Useful when root placement is correct, but the pulse center needs a tiny nudge.
const GRAVITY_RING_CENTER_OFFSET_X = 0;
const GRAVITY_RING_CENTER_OFFSET_Y = 0.02;
const GRAVITY_RING_CENTER_OFFSET_Z = 0;
const GRAVITY_RING_LAYER_Z_STEP = 0.006;

// Outward-only pulse behavior.
// The rings no longer breathe back inward. They expand from center, fade out,
// then restart invisibly from the center in an infinite loop.
const GRAVITY_RING_COUNT = 3;
const GRAVITY_RING_MIN_SCALE = 0.28;
const GRAVITY_RING_MAX_SCALE = 2.85;
const GRAVITY_RING_PULSE_DURATION_SECONDS = 3.35;
const GRAVITY_RING_STAGGER_SECONDS = 0.72;
const GRAVITY_RING_FADE_IN_END = 0.08;
const GRAVITY_RING_FADE_OUT_START = 0.42;
const GRAVITY_RING_MAX_OPACITY = 0.2;
const GRAVITY_RING_OPACITY_FALLOFF_PER_RING = 0.08;

// Reveal dramaturgy.
// Rings stay invisible after marker lock and begin only once resonance is confirmed.
// On each CONFIRMED transition the outward pulse clock restarts from center.
const GRAVITY_RING_REVEAL_REQUIRE_CONFIRMED = true;
const GRAVITY_RING_REVEAL_FADE_IN_SECONDS = 0.85;
const GRAVITY_RING_REVEAL_FADE_OUT_SECONDS = 0.22;

// Shape tuning. Values above 1 stretch the sprite on that axis.
const GRAVITY_RING_AXIS_SCALE_X = 1.0;
const GRAVITY_RING_AXIS_SCALE_Y = 1.0;

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return `rgba(255,255,255,${alpha})`;
  }

  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;

  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function easeOutCubic(value: number): number {
  const x = clamp01(value);
  return 1 - Math.pow(1 - x, 3);
}

function isGravityRingsRevealActive(resonanceState?: string): boolean {
  if (!GRAVITY_RING_REVEAL_REQUIRE_CONFIRMED) return true;
  return resonanceState === 'CONFIRMED';
}

function createRingTexture(size = 256, color = '#ffffff', thickness = 0.12): HTMLCanvasElement {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;

  const ctx = cvs.getContext('2d');
  if (!ctx) {
    throw new Error('[R4] Unable to create gravity pulse ring canvas context');
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.9;

  ctx.clearRect(0, 0, size, size);

  // Outer soft ring via radial gradient.
  // Keep the texture as a soft alpha-like ring, but tint it with `color`
  // so the parameter is intentional and TypeScript does not treat it as dead code.
  const grad = ctx.createRadialGradient(cx, cy, r * (1 - thickness), cx, cy, r);
  grad.addColorStop(0, hexToRgba(color, 0));
  grad.addColorStop(0.45, hexToRgba(color, 0.08));
  grad.addColorStop(0.68, hexToRgba(color, 0.22));
  grad.addColorStop(1, hexToRgba(color, 0));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return cvs;
}

export function createGravityPulseRings(parent: THREE.Object3D): GravityPulseRingsHandle {
  const root = new THREE.Group();
  root.name = 'gravity-pulse-rings-root';

  root.position.x = GRAVITY_RINGS_ROOT_OFFSET_X;
  root.position.y = GRAVITY_RINGS_ROOT_OFFSET_Y;
  root.position.z = GRAVITY_RINGS_ROOT_OFFSET_Z;

  const rings: THREE.Sprite[] = [];
  const mats: THREE.SpriteMaterial[] = [];
  const texs: THREE.CanvasTexture[] = [];

  for (let i = 0; i < GRAVITY_RING_COUNT; i++) {
    const tex = new THREE.CanvasTexture(createRingTexture(256, '#ffffff', 0.12));
    tex.needsUpdate = true;
    texs.push(tex);

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      color: new THREE.Color(0x06b6d4),
    });
    mats.push(mat);

    const sprite = new THREE.Sprite(mat);
    sprite.name = `gravity-pulse-ring-${i}`;
    sprite.renderOrder = 9000 + i;
    sprite.position.x = GRAVITY_RING_CENTER_OFFSET_X;
    sprite.position.y = GRAVITY_RING_CENTER_OFFSET_Y;
    sprite.position.z = GRAVITY_RING_CENTER_OFFSET_Z + i * GRAVITY_RING_LAYER_Z_STEP;

    sprite.scale.set(
      GRAVITY_RING_MIN_SCALE * GRAVITY_RING_AXIS_SCALE_X,
      GRAVITY_RING_MIN_SCALE * GRAVITY_RING_AXIS_SCALE_Y,
      1,
    );

    root.add(sprite);
    rings.push(sprite);
  }

  parent.add(root);

  return {
    root,
    rings,
    _resources: { mats, texs },
    _reveal: {
      active: false,
      startedAt: 0,
      lastElapsed: null,
      visibility: GRAVITY_RING_REVEAL_REQUIRE_CONFIRMED ? 0 : 1,
    },
  };
}

export function updateGravityPulseRings(
  handle: GravityPulseRingsHandle,
  elapsedSeconds: number,
  options: { hudMode: 'COLOR' | 'IR'; resonanceState?: string },
): void {
  const t = elapsedSeconds;
  const mode = options.hudMode === 'IR' ? 'IR' : 'COLOR';
  const shouldReveal = isGravityRingsRevealActive(options.resonanceState);

  const previousElapsed = handle._reveal.lastElapsed;
  const dt = previousElapsed === null ? 1 / 60 : Math.min(0.1, Math.max(0, t - previousElapsed));
  handle._reveal.lastElapsed = t;

  // Restart the outward pulse cycle exactly when resonance becomes confirmed.
  if (shouldReveal && !handle._reveal.active) {
    handle._reveal.startedAt = t;
  }

  handle._reveal.active = shouldReveal;

  if (shouldReveal) {
    handle._reveal.visibility = clamp01(
      handle._reveal.visibility + dt / Math.max(0.001, GRAVITY_RING_REVEAL_FADE_IN_SECONDS),
    );
  } else {
    handle._reveal.visibility = clamp01(
      handle._reveal.visibility - dt / Math.max(0.001, GRAVITY_RING_REVEAL_FADE_OUT_SECONDS),
    );
  }

  const revealVisibility = smoothstep(0, 1, handle._reveal.visibility);
  const pulseClock = Math.max(0, t - handle._reveal.startedAt);

  const palette =
    mode === 'COLOR'
      ? [new THREE.Color(0x0891b2), new THREE.Color(0x06b6d4), new THREE.Color(0x14b8a6)]
      : [new THREE.Color(0xdc2626), new THREE.Color(0xfb923c), new THREE.Color(0xf97316)];

  for (let i = 0; i < handle.rings.length; i++) {
    const ring = handle.rings[i];
    const mat = handle._resources.mats[i];

    if (!mat) continue;

    const pulseTime = (pulseClock + i * GRAVITY_RING_STAGGER_SECONDS) / GRAVITY_RING_PULSE_DURATION_SECONDS;
    const progress = pulseTime - Math.floor(pulseTime);
    const expansion = easeOutCubic(progress);
    const scale = THREE.MathUtils.lerp(GRAVITY_RING_MIN_SCALE, GRAVITY_RING_MAX_SCALE, expansion);

    const fadeIn = smoothstep(0, GRAVITY_RING_FADE_IN_END, progress);
    const fadeOut = 1 - smoothstep(GRAVITY_RING_FADE_OUT_START, 1, progress);
    const ringOpacityMultiplier = 1 - i * GRAVITY_RING_OPACITY_FALLOFF_PER_RING;
    const opacity =
      GRAVITY_RING_MAX_OPACITY *
      fadeIn *
      fadeOut *
      Math.max(0.35, ringOpacityMultiplier) *
      revealVisibility;

    ring.scale.set(
      scale * GRAVITY_RING_AXIS_SCALE_X,
      scale * GRAVITY_RING_AXIS_SCALE_Y,
      1,
    );

    mat.opacity = opacity;
    mat.color.copy(palette[i % palette.length]);
  }
}

export function disposeGravityPulseRings(handle: GravityPulseRingsHandle): void {
  handle.root.parent?.remove(handle.root);

  handle._resources.mats.forEach((mat) => mat.dispose());
  handle._resources.texs.forEach((tex) => tex.dispose());
}
