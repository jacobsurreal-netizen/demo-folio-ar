import * as THREE from 'three';

export type GravityPulseRingsHandle = {
  root: THREE.Group;
  rings: THREE.Sprite[];
  _resources: {
    mats: THREE.SpriteMaterial[];
    texs: THREE.CanvasTexture[];
  };
};

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

  const ringCount = 3;
  const rings: THREE.Sprite[] = [];
  const mats: THREE.SpriteMaterial[] = [];
  const texs: THREE.CanvasTexture[] = [];

  for (let i = 0; i < ringCount; i++) {
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
      opacity: 0.18,
      color: new THREE.Color(0x06b6d4),
    });
    mats.push(mat);

    const sprite = new THREE.Sprite(mat);
    sprite.name = `gravity-pulse-ring-${i}`;
    sprite.renderOrder = 9000 + i;
    sprite.position.set(0, 0.02 + i * 0.01, 0);

    const baseScale = 1.2 + i * 0.8;
    sprite.scale.set(baseScale, baseScale, 1);

    root.add(sprite);
    rings.push(sprite);
  }

  parent.add(root);

  return { root, rings, _resources: { mats, texs } };
}

export function updateGravityPulseRings(
  handle: GravityPulseRingsHandle,
  elapsedSeconds: number,
  options: { hudMode: 'COLOR' | 'IR'; resonanceState?: string },
): void {
  const t = elapsedSeconds;
  const mode = options.hudMode === 'IR' ? 'IR' : 'COLOR';

  const palette =
    mode === 'COLOR'
      ? [new THREE.Color(0x0891b2), new THREE.Color(0x06b6d4), new THREE.Color(0x14b8a6)]
      : [new THREE.Color(0xdc2626), new THREE.Color(0xfb923c), new THREE.Color(0xf97316)];

  // Gentle slow expansion per ring with phase offset.
  for (let i = 0; i < handle.rings.length; i++) {
    const ring = handle.rings[i];
    const mat = handle._resources.mats[i];

    if (!mat) continue;

    const phase = t * 0.65 + i * 0.9;
    const expand = 1.0 + 0.45 * Math.sin(phase) + i * 0.6;
    const opacity = 0.08 + 0.08 * (0.6 + 0.6 * Math.cos(phase + i));

    ring.scale.setScalar(expand);
    mat.opacity = opacity;
    mat.color.copy(palette[i % palette.length]);
  }
}

export function disposeGravityPulseRings(handle: GravityPulseRingsHandle): void {
  handle.root.parent?.remove(handle.root);

  handle._resources.mats.forEach((mat) => mat.dispose());
  handle._resources.texs.forEach((tex) => tex.dispose());
}
