import * as THREE from 'three';

type TokenSurfaceResources = {
  spillGeo: THREE.PlaneGeometry;
  spillMat: THREE.MeshBasicMaterial;
  spillTex: THREE.CanvasTexture;
  patternGeo: THREE.PlaneGeometry;
  patternMat: THREE.ShaderMaterial;
  patternTex: THREE.Texture;
};

export type TokenSurfaceHandle = {
  root: THREE.Group;
  surface: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  myceliumPulse: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  _resources: TokenSurfaceResources;
};

const TOKEN_BIOPATTERN_MASK_URL = '/ar/token-biopattern-mask.png';

// Current tuned placement for the token surface response.
// Keep this attached to smoothingRoot; these offsets only move the local surface layer.
const SURFACE_X_OFFSET = -1.86;
const SURFACE_Y_OFFSET = 0;
const SURFACE_Z_OFFSET = 0;

const LIGHT_SPILL_SIZE = 1.8;
const PATTERN_WIDTH = 1.8;
const PATTERN_HEIGHT = 1.01;

// Independent tuning for the biopattern plane.
// Keep the root offset for the working light spill, then tune the mycelium layer locally.
const MYCELIUM_SCALE_X = 0.93;
const MYCELIUM_SCALE_Y = 0.93;
const MYCELIUM_OFFSET_X = 1.86;
const MYCELIUM_OFFSET_Y = 0.06;
const MYCELIUM_Z_OFFSET = 0.001;

const COLOR_MODE_MYCELIUM_COLOR = 0x50c85e;
const IR_MODE_MYCELIUM_COLOR = 0xff8a2a;
const MYCELIUM_COLOR_OPACITY = 0.28;
const MYCELIUM_IR_OPACITY = 0.3;

// Fake artifact occlusion for the mycelium pulse.
// This keeps the surface-bound pattern from visually drawing through the central artifact.
// Tune these first if the central hole is too small / too large.
const MYCELIUM_OCCLUSION_CENTER_X = 0.5;
const MYCELIUM_OCCLUSION_CENTER_Y = 0.62;
const MYCELIUM_OCCLUSION_RADIUS = 0.36;
const MYCELIUM_OCCLUSION_SOFTNESS = 0.22;
const MYCELIUM_OCCLUSION_STRENGTH = 1.0;

function createRadialMask(size = 256): HTMLCanvasElement {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;

  const ctx = cvs.getContext('2d');
  if (!ctx) {
    throw new Error('[R4] Unable to create token surface radial mask context');
  }

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  // White center, soft falloff to transparent.
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return cvs;
}

function createTransparentTexture(): THREE.CanvasTexture {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 2;

  const ctx = cvs.getContext('2d');
  if (!ctx) {
    throw new Error('[R4] Unable to create token mycelium placeholder texture context');
  }

  ctx.clearRect(0, 0, 2, 2);

  const tex = new THREE.CanvasTexture(cvs);
  tex.needsUpdate = true;

  return tex;
}

function createMyceliumPulseMaterial(maskTexture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    uniforms: {
      uMask: { value: maskTexture },
      uColor: { value: new THREE.Color(COLOR_MODE_MYCELIUM_COLOR) },
      uTime: { value: 0 },
      uOpacity: { value: MYCELIUM_COLOR_OPACITY },
      uAspect: { value: PATTERN_WIDTH / PATTERN_HEIGHT },
      uPulseWidth: { value: 0.075 },
      uSoftness: { value: 0.12 },
      uBaseVisibility: { value: 0.0 },
      uOcclusionCenter: {
        value: new THREE.Vector2(
          MYCELIUM_OCCLUSION_CENTER_X,
          MYCELIUM_OCCLUSION_CENTER_Y,
        ),
      },
      uOcclusionRadius: { value: MYCELIUM_OCCLUSION_RADIUS },
      uOcclusionSoftness: { value: MYCELIUM_OCCLUSION_SOFTNESS },
      uOcclusionStrength: { value: MYCELIUM_OCCLUSION_STRENGTH },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;

      uniform sampler2D uMask;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uAspect;
      uniform float uPulseWidth;
      uniform float uSoftness;
      uniform float uBaseVisibility;
      uniform vec2 uOcclusionCenter;
      uniform float uOcclusionRadius;
      uniform float uOcclusionSoftness;
      uniform float uOcclusionStrength;

      varying vec2 vUv;

      void main() {
        vec4 mask = texture2D(uMask, vUv);

        // Prefer alpha, but keep a luminance fallback for white-mask exports.
        float luminance = max(mask.r, max(mask.g, mask.b));
        float maskAlpha = mask.a * luminance;

        vec2 centeredUv = vUv - vec2(0.5);
        vec2 ellipticalUv = vec2(centeredUv.x * uAspect, centeredUv.y);
        float distFromCenter = length(ellipticalUv);

        // Expanding elliptical pulse: center -> edges -> repeat.
        float pulseRadius = mix(0.05, 0.88, fract(uTime * 0.17));
        float ringDistance = abs(distFromCenter - pulseRadius);
        float ring = 1.0 - smoothstep(uPulseWidth, uPulseWidth + uSoftness, ringDistance);

        // A small secondary echo keeps the pulse organic without adding another mesh.
        float echoRadius = mix(0.05, 0.88, fract(uTime * 0.17 + 0.46));
        float echoDistance = abs(distFromCenter - echoRadius);
        float echo = 1.0 - smoothstep(uPulseWidth * 0.7, uPulseWidth + uSoftness, echoDistance);

        float activation = uBaseVisibility + ring + echo * 0.32;
        float alpha = maskAlpha * activation * uOpacity;

        // Fake central occlusion: keep the mycelium pulse from visually drawing through
        // the artifact center. This is a soft UV-space hole, not a new render pass.
        vec2 occlusionUv = vUv - uOcclusionCenter;
        vec2 ellipticalOcclusionUv = vec2(occlusionUv.x * uAspect, occlusionUv.y);
        float occlusionDist = length(ellipticalOcclusionUv);
        float occlusionReveal = smoothstep(
          uOcclusionRadius,
          uOcclusionRadius + uOcclusionSoftness,
          occlusionDist
        );

        alpha *= mix(1.0, occlusionReveal, uOcclusionStrength);

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

export function createTokenSurfaceResponse(parent: THREE.Object3D): TokenSurfaceHandle {
  const root = new THREE.Group();
  root.name = 'token-surface-response-root';
  root.position.set(SURFACE_X_OFFSET, SURFACE_Y_OFFSET, SURFACE_Z_OFFSET);

  // Light spill plane lives very close to marker surface; default PlaneGeometry faces +Z.
  const spillGeo = new THREE.PlaneGeometry(LIGHT_SPILL_SIZE, LIGHT_SPILL_SIZE);

  const spillTex = new THREE.CanvasTexture(createRadialMask(256));
  spillTex.needsUpdate = true;

  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTex,
    color: new THREE.Color(0x06b6d4),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const surface = new THREE.Mesh(spillGeo, spillMat);
  surface.name = 'artifact-light-spill';
  surface.position.set(0, 0, 0.001);
  surface.renderOrder = 0;

  root.add(surface);

  const patternTex = createTransparentTexture();
  const patternMat = createMyceliumPulseMaterial(patternTex);
  const patternGeo = new THREE.PlaneGeometry(PATTERN_WIDTH, PATTERN_HEIGHT);

  const myceliumPulse = new THREE.Mesh(patternGeo, patternMat);
  myceliumPulse.name = 'token-mycelium-pulse';
  myceliumPulse.position.set(MYCELIUM_OFFSET_X, MYCELIUM_OFFSET_Y, MYCELIUM_Z_OFFSET);
  myceliumPulse.scale.set(MYCELIUM_SCALE_X, MYCELIUM_SCALE_Y, 1);
  myceliumPulse.renderOrder = 1;

  root.add(myceliumPulse);

  const resources: TokenSurfaceResources = {
    spillGeo,
    spillMat,
    spillTex,
    patternGeo,
    patternMat,
    patternTex,
  };

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    TOKEN_BIOPATTERN_MASK_URL,
    (loadedTexture) => {
      loadedTexture.needsUpdate = true;

      const previousTexture = resources.patternTex;
      resources.patternTex = loadedTexture;
      patternMat.uniforms.uMask.value = loadedTexture;

      previousTexture.dispose();
    },
    undefined,
    (err) => {
      console.warn('[R4] Failed to load token biopattern mask texture', err);
    },
  );

  parent.add(root);

  return { root, surface, myceliumPulse, _resources: resources };
}

export function updateTokenSurfaceResponse(
  handle: TokenSurfaceHandle,
  elapsedSeconds: number,
  options: { hudMode: 'COLOR' | 'IR'; resonanceState?: string },
): void {
  const t = elapsedSeconds;

  const spillColor = options.hudMode === 'IR'
    ? new THREE.Color(0xffb86b)
    : new THREE.Color(0x06b6d4);

  const patternColor = options.hudMode === 'IR'
    ? new THREE.Color(IR_MODE_MYCELIUM_COLOR)
    : new THREE.Color(COLOR_MODE_MYCELIUM_COLOR);

  // Light spill breathing: subtle scale + opacity modulation.
  const spillBreathe = 1.0 + 0.035 * Math.sin(t * 0.6);
  handle.surface.scale.set(spillBreathe, spillBreathe, 1);

  const spillBaseOpacity = 0.18;
  const spillOpacity = spillBaseOpacity * (0.9 + 0.1 * Math.sin(t * 0.8 + 0.3));

  handle._resources.spillMat.opacity = spillOpacity;
  handle._resources.spillMat.color.copy(spillColor);

  // Token mycelium pulse: texture reveal handled in shader.
  const patternBreathe = 1.0 + 0.018 * Math.sin(t * 0.35 + 0.7);
  handle.myceliumPulse.scale.set(
    MYCELIUM_SCALE_X * patternBreathe,
    MYCELIUM_SCALE_Y * patternBreathe,
    1,
  );

  handle._resources.patternMat.uniforms.uTime.value = t;
  handle._resources.patternMat.uniforms.uColor.value.copy(patternColor);
  handle._resources.patternMat.uniforms.uOpacity.value = options.hudMode === 'IR' ? MYCELIUM_IR_OPACITY : MYCELIUM_COLOR_OPACITY;
}

export function disposeTokenSurfaceResponse(handle: TokenSurfaceHandle): void {
  handle.root.parent?.remove(handle.root);

  handle._resources.spillTex.dispose();
  handle._resources.spillMat.dispose();
  handle._resources.spillGeo.dispose();

  handle._resources.patternTex.dispose();
  handle._resources.patternMat.dispose();
  handle._resources.patternGeo.dispose();
}
