import * as THREE from 'three';

const INNER_AURA_SIZE = 2.8;
const OUTER_AURA_SIZE = 4.2;
const TEXTURE_SIZE = 256;

const COLOR_PALETTE = {
  inner: new THREE.Color(0x0891b2),
  outer: new THREE.Color(0x06b6d4),
};

const IR_PALETTE = {
  inner: new THREE.Color(0xdc2626),
  outer: new THREE.Color(0xfb923c),
};

export interface ResonanceAuraHandle {
  root: THREE.Group;
  inner: THREE.Sprite;
  outer: THREE.Sprite;
  _resources: {
    innerMat: THREE.SpriteMaterial;
    outerMat: THREE.SpriteMaterial;
    innerTex: THREE.CanvasTexture | null;
    outerTex: THREE.CanvasTexture | null;
  };
}

function hexToRgb(hex: string): string {
  const parsed = hex.replace('#', '');
  const bigint = Number.parseInt(parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `${r}, ${g}, ${b}`;
}

function createRadialTexture(size = TEXTURE_SIZE, color = '#ffffff', alpha = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('[AR] Failed to create resonance aura canvas context');
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, size / 2);

  gradient.addColorStop(0, `rgba(${hexToRgb(color)}, ${alpha})`);
  gradient.addColorStop(0.38, `rgba(${hexToRgb(color)}, ${alpha * 0.42})`);
  gradient.addColorStop(0.72, `rgba(${hexToRgb(color)}, ${alpha * 0.14})`);
  gradient.addColorStop(1, `rgba(${hexToRgb(color)}, 0)`);

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return canvas;
}

function createAuraSprite(
  name: string,
  texture: THREE.CanvasTexture,
  color: THREE.Color,
  opacity: number,
  size: number,
  renderOrder: number,
): { sprite: THREE.Sprite; material: THREE.SpriteMaterial } {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    opacity,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  sprite.renderOrder = renderOrder;
  sprite.scale.set(size, size, 1);

  return { sprite, material };
}

export function createResonanceAura(parent: THREE.Object3D): ResonanceAuraHandle {
  const root = new THREE.Group();
  root.name = 'resonance-aura-root';

  const innerTex = new THREE.CanvasTexture(createRadialTexture(TEXTURE_SIZE, '#ffffff', 0.9));
  innerTex.needsUpdate = true;

  const outerTex = new THREE.CanvasTexture(createRadialTexture(TEXTURE_SIZE, '#ffffff', 0.75));
  outerTex.needsUpdate = true;

  const { sprite: outer, material: outerMat } = createAuraSprite(
    'resonance-aura-outer',
    outerTex,
    COLOR_PALETTE.outer,
    0.28,
    OUTER_AURA_SIZE,
    19,
  );

  const { sprite: inner, material: innerMat } = createAuraSprite(
    'resonance-aura-inner',
    innerTex,
    COLOR_PALETTE.inner,
    0.42,
    INNER_AURA_SIZE,
    20,
  );

  root.add(outer);
  root.add(inner);
  parent.add(root);

  return {
    root,
    inner,
    outer,
    _resources: {
      innerMat,
      outerMat,
      innerTex,
      outerTex,
    },
  };
}

export function updateResonanceAura(
  handle: ResonanceAuraHandle,
  elapsedSeconds: number,
  options: { hudMode: 'COLOR' | 'IR'; resonanceState?: string },
): void {
  const time = elapsedSeconds;
  const palette = options.hudMode === 'IR' ? IR_PALETTE : COLOR_PALETTE;

  const innerBreathe = Math.sin(time * 0.5) * 0.05 + 1.0;
  const outerBreathe = Math.sin(time * 0.4 + 0.5) * 0.08 + 1.15;

  handle.inner.scale.set(
    INNER_AURA_SIZE * innerBreathe,
    INNER_AURA_SIZE * innerBreathe,
    1,
  );

  handle.outer.scale.set(
    OUTER_AURA_SIZE * outerBreathe,
    OUTER_AURA_SIZE * outerBreathe,
    1,
  );

  const innerOpacity = 0.34 * (0.86 + 0.14 * Math.sin(time * 0.9 + 0.2));
  const outerOpacity = 0.2 * (0.9 + 0.1 * Math.sin(time * 0.7 - 0.3));

  handle._resources.innerMat.opacity = innerOpacity;
  handle._resources.outerMat.opacity = outerOpacity;

  handle._resources.innerMat.color.copy(palette.inner);
  handle._resources.outerMat.color.copy(palette.outer);
}

export function disposeResonanceAura(handle: ResonanceAuraHandle): void {
  handle.root.parent?.remove(handle.root);

  const { innerMat, outerMat, innerTex, outerTex } = handle._resources;

  innerTex?.dispose();
  outerTex?.dispose();
  innerMat.dispose();
  outerMat.dispose();
}
