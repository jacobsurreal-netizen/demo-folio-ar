import * as THREE from 'three';

export type TokenSurfaceHandle = {
  root: THREE.Group;
  surface: THREE.Mesh;
  _resources: {
    geo: THREE.PlaneGeometry;
    mat: THREE.MeshBasicMaterial;
    tex: THREE.CanvasTexture | null;
  };
};

function createRadialMask(size = 256) {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  // white center, soft falloff to transparent
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return cvs;
}

export function createTokenSurfaceResponse(parent: THREE.Object3D): TokenSurfaceHandle {
  const root = new THREE.Group();
  root.name = 'token-surface-response-root';

  // Plane lives very close to marker surface; default PlaneGeometry faces +Z (sits in XY)
  const size = 1.8;
  const geo = new THREE.PlaneGeometry(size, size);

  const tex = new THREE.CanvasTexture(createRadialMask(256));
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(0x66cc33), // default tint: cyan
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const surface = new THREE.Mesh(geo, mat);
surface.name = "artifact-light-spill";

// Position just in front of marker surface along local +Z.
surface.position.set(0, 0, 0.001);
surface.renderOrder = 8000;

root.add(surface);

// Move the whole token-surface response lower on the marker/card.
const SURFACE_Y_OFFSET = -0.56;
root.position.set(0, SURFACE_Y_OFFSET, 0);
const SURFACE_X_OFFSET = -1.86;
root.position.set(SURFACE_X_OFFSET, 0, 0);

parent.add(root);

return { root, surface, _resources: { geo, mat, tex } };

  return { root, surface, _resources: { geo, mat, tex } };
}

export function updateTokenSurfaceResponse(
  handle: TokenSurfaceHandle,
  elapsedSeconds: number,
  options: { hudMode: 'COLOR' | 'IR'; resonanceState?: string },
): void {
  const t = elapsedSeconds;

  const palette = options.hudMode === 'IR'
    ? new THREE.Color(0xffb86b)
    : new THREE.Color(0x06b6d4);

  // slow breathing: subtle scale + opacity modulation
  const breathe = 1.0 + 0.035 * Math.sin(t * 0.6);
  handle.surface.scale.set(breathe, breathe, 1);

  const baseOpacity = 0.18;
  const opacity = baseOpacity * (0.9 + 0.1 * Math.sin(t * 0.8 + 0.3));

  handle._resources.mat.opacity = opacity;
  handle._resources.mat.color.copy(palette);
}

export function disposeTokenSurfaceResponse(handle: TokenSurfaceHandle): void {
  handle.root.parent?.remove(handle.root);
  handle._resources.tex?.dispose();
  handle._resources.mat.dispose();
  handle._resources.geo.dispose();
}
