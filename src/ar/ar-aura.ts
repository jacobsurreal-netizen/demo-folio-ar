import * as THREE from "three";

// R4 Aura tuning block -------------------------------------------------------
// Root offset moves the whole aura field relative to artifact-field-root.
const AURA_ROOT_OFFSET_X = 0.15;
const AURA_ROOT_OFFSET_Y = 0.45;
const AURA_ROOT_OFFSET_Z = -0.5; // Tohle může dělat lens-flare jak hovado. 
// This Z offset is a hack to reduce occlusion by the artifact surface. The aura sprites are still rendered in front of the artifact, but this helps with depth sorting issues that can cause flickering when the sprites are exactly coplanar with the surface.
// Z offset controls spatial parallax of the aura layer.
// Higher values detach the aura from the artifact plane and create optical-depth / flare behavior.

// Local offsets move only the individual aura sprites.
const INNER_AURA_OFFSET_X = 0;
const INNER_AURA_OFFSET_Y = 0;
const INNER_AURA_OFFSET_Z = 0;

const OUTER_AURA_OFFSET_X = 0;
const OUTER_AURA_OFFSET_Y = 0;
const OUTER_AURA_OFFSET_Z = 0;

// Base sizes. Keep these as the main “how large is the field” controls.
const INNER_AURA_SIZE = 0.8 * 1.2;
const OUTER_AURA_SIZE = 1.5 * 2;

// Axis scale lets you make the aura subtly elliptical without changing offsets.
const INNER_AURA_AXIS_SCALE_X = 1.0;
const INNER_AURA_AXIS_SCALE_Y = 1.0;
const INNER_AURA_AXIS_SCALE_Z = 1.0;

const OUTER_AURA_AXIS_SCALE_X = 1.0;
const OUTER_AURA_AXIS_SCALE_Y = 1.0;
const OUTER_AURA_AXIS_SCALE_Z = 1.0;

// Motion / intensity tuning.
const INNER_AURA_BREATHE_MULTIPLIER = 1.6;
const OUTER_AURA_BREATHE_MULTIPLIER = 1.5;
const INNER_AURA_OPACITY_MULTIPLIER = 1.12;
const OUTER_AURA_OPACITY_MULTIPLIER = 0.26;

// Keep this false for production tuning. Switch to true only when debugging attach point.
const AURA_DEBUG_PROBE_ENABLED = false;
const AURA_DEBUG_PROBE_OFFSET_X = 0;
const AURA_DEBUG_PROBE_OFFSET_Y = 0.25;
const AURA_DEBUG_PROBE_OFFSET_Z = 0;

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
    probeGeo?: THREE.SphereGeometry;
    probeMat?: THREE.MeshBasicMaterial;
  };
}

function hexToRgb(hex: string): string {
  const parsed = hex.replace("#", "");
  const bigint = Number.parseInt(parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `${r}, ${g}, ${b}`;
}

function createRadialTexture(
  size = 256,
  color = "#ffffff",
  alpha = 1,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("[AR] Failed to create resonance aura canvas context");
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    size / 2,
  );

  gradient.addColorStop(0, `rgba(${hexToRgb(color)}, ${alpha})`);
  gradient.addColorStop(0.45, `rgba(${hexToRgb(color)}, ${alpha * 0.55})`);
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

function applyAuraTuning(
  handle: ResonanceAuraHandle,
  innerBreathe = 1,
  outerBreathe = 1,
): void {
  handle.root.position.set(
    AURA_ROOT_OFFSET_X,
    AURA_ROOT_OFFSET_Y,
    AURA_ROOT_OFFSET_Z,
  );

  handle.inner.position.set(
    INNER_AURA_OFFSET_X,
    INNER_AURA_OFFSET_Y,
    INNER_AURA_OFFSET_Z,
  );
  handle.outer.position.set(
    OUTER_AURA_OFFSET_X,
    OUTER_AURA_OFFSET_Y,
    OUTER_AURA_OFFSET_Z,
  );

  handle.inner.scale.set(
    INNER_AURA_SIZE * innerBreathe * INNER_AURA_AXIS_SCALE_X,
    INNER_AURA_SIZE * innerBreathe * INNER_AURA_AXIS_SCALE_Y,
    INNER_AURA_AXIS_SCALE_Z,
  );

  handle.outer.scale.set(
    OUTER_AURA_SIZE * outerBreathe * OUTER_AURA_AXIS_SCALE_X,
    OUTER_AURA_SIZE * outerBreathe * OUTER_AURA_AXIS_SCALE_Y,
    OUTER_AURA_AXIS_SCALE_Z,
  );
}

export function createResonanceAura(
  parent: THREE.Object3D,
): ResonanceAuraHandle {
  const root = new THREE.Group();
  root.name = "resonance-aura-root";
  root.position.set(AURA_ROOT_OFFSET_X, AURA_ROOT_OFFSET_Y, AURA_ROOT_OFFSET_Z);

  const innerTex = new THREE.CanvasTexture(
    createRadialTexture(256, "#ffffff", 1.0),
  );
  innerTex.needsUpdate = true;

  const outerTex = new THREE.CanvasTexture(
    createRadialTexture(256, "#ffffff", 1.0),
  );
  outerTex.needsUpdate = true;

  const { sprite: inner, material: innerMat } = createAuraSprite(
    "resonance-aura-inner",
    innerTex,
    COLOR_PALETTE.inner,
    0.95,
    INNER_AURA_SIZE,
    9999,
  );

  const { sprite: outer, material: outerMat } = createAuraSprite(
    "resonance-aura-outer",
    outerTex,
    COLOR_PALETTE.outer,
    0.85,
    OUTER_AURA_SIZE,
    9998,
  );

  root.add(outer);
  root.add(inner);

  const resources: ResonanceAuraHandle["_resources"] = {
    innerMat,
    outerMat,
    innerTex,
    outerTex,
  };

  if (AURA_DEBUG_PROBE_ENABLED) {
    const probeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff00ff),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const probeGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const probe = new THREE.Mesh(probeGeo, probeMat);
    probe.name = "r4-aura-debug-probe";
    probe.renderOrder = 9999;
    probe.position.set(
      AURA_DEBUG_PROBE_OFFSET_X,
      AURA_DEBUG_PROBE_OFFSET_Y,
      AURA_DEBUG_PROBE_OFFSET_Z,
    );
    root.add(probe);

    resources.probeGeo = probeGeo;
    resources.probeMat = probeMat;
  }

  const handle: ResonanceAuraHandle = {
    root,
    inner,
    outer,
    _resources: resources,
  };

  applyAuraTuning(handle);
  parent.add(root);

  return handle;
}

export function updateResonanceAura(
  handle: ResonanceAuraHandle,
  elapsedSeconds: number,
  options: { hudMode: "COLOR" | "IR"; resonanceState?: string },
): void {
  const time = elapsedSeconds;
  const palette = options.hudMode === "IR" ? IR_PALETTE : COLOR_PALETTE;

  const innerBreathe =
    (Math.sin(time * 0.5) * 0.05 + 1.0) * INNER_AURA_BREATHE_MULTIPLIER;
  const outerBreathe =
    (Math.sin(time * 0.4 + 0.5) * 0.08 + 1.15) * OUTER_AURA_BREATHE_MULTIPLIER;

  applyAuraTuning(handle, innerBreathe, outerBreathe);

  const innerBase = 0.55;
  const outerBase = 0.28;
  const innerOpacity = innerBase * (0.85 + 0.15 * Math.sin(time * 0.9 + 0.2));
  const outerOpacity = outerBase * (0.9 + 0.1 * Math.sin(time * 0.7 - 0.3));

  handle._resources.innerMat.opacity = Math.min(
    1,
    innerOpacity * INNER_AURA_OPACITY_MULTIPLIER,
  );
  handle._resources.outerMat.opacity = Math.min(
    1,
    outerOpacity * OUTER_AURA_OPACITY_MULTIPLIER,
  );

  handle._resources.innerMat.color.copy(palette.inner);
  handle._resources.outerMat.color.copy(palette.outer);
}

export function disposeResonanceAura(handle: ResonanceAuraHandle): void {
  handle.root.parent?.remove(handle.root);

  const { innerMat, outerMat, innerTex, outerTex, probeGeo, probeMat } =
    handle._resources;

  innerTex?.dispose();
  outerTex?.dispose();
  innerMat.dispose();
  outerMat.dispose();
  probeGeo?.dispose();
  probeMat?.dispose();
}
