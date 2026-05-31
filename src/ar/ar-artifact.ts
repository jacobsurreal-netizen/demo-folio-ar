/**
 * SURREAL EXP LAB // DEMO V1
 * Artifact entity — load, position, and animate the floating artifact.
 *
 * Loads a GLB model via Three.js GLTFLoader and attaches it to a
 * MindAR anchor group. Provides a per-frame update function for
 * the idle rotation animation.
 *
 * No particles. No bloom. No shaders. No advanced animation.
 * Just: load → position → rotate.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARTIFACT_CONFIG } from './ar-config';
import { arStore } from '../state/store';

/** Handle returned by loadArtifact for per-frame updates */
export interface ArtifactHandle {
  /** Call every frame inside the render loop */
  update: () => void;
  /** Dispose geometry and materials */
  dispose: () => void;
}

/**
 * Apply a subtle base emissive to every material that supports it.
 * Runs once after load — never inside the render loop. Materials without
 * an `emissive` property (e.g. MeshBasicMaterial) are left untouched.
 */
function applyEmissive(model: THREE.Object3D): void {
  const { color, intensity } = ARTIFACT_CONFIG.emissive;
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      const emissiveMat = mat as THREE.Material & {
        emissive?: THREE.Color;
        emissiveIntensity?: number;
      };
      if (emissiveMat?.emissive) {
        emissiveMat.emissive.setHex(color);
        emissiveMat.emissiveIntensity = intensity;
        emissiveMat.needsUpdate = true;
      }
    });
  });
}

/**
 * Build a lightweight fake-glow shell sized from the model's bounds.
 * One transparent back-side sphere — a cheap "contains energy" halo with
 * no postprocessing, no bloom, and no per-frame cost. Returns null when
 * glow is disabled or the model has no measurable size.
 */
function createGlowShell(model: THREE.Object3D): THREE.Mesh | null {
  const cfg = ARTIFACT_CONFIG.glow;
  if (!cfg.enabled) return null;

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (sphere.radius <= 0) return null;

  const geometry = new THREE.SphereGeometry(sphere.radius * cfg.scale, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: cfg.opacity,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(geometry, material);
  glow.position.copy(sphere.center);
  return glow;
}

/**
 * Load the artifact GLB and attach it to the provided parent group.
 *
 * @param parent - MindAR anchor group (content tracks with marker)
 * @returns Promise resolving to an ArtifactHandle
 */
export async function loadArtifact(parent: THREE.Group): Promise<ArtifactHandle> {
  const loader = new GLTFLoader();

  return new Promise<ArtifactHandle>((resolve, reject) => {
    loader.load(
      ARTIFACT_CONFIG.modelPath,

      // ── Success ──
      (gltf) => {
        const model = gltf.scene;

        // Scale
        const s = ARTIFACT_CONFIG.scale;
        model.scale.set(s, s, s);

        // Position above marker
        const p = ARTIFACT_CONFIG.position;
        model.position.set(p.x, p.y, p.z);

        // ── Material readability pass (once, outside the render loop) ──
        // Apply a subtle base emissive only to materials that support it.
        // Existing materials are preserved; non-emissive materials are skipped.
        applyEmissive(model);

        // Attach to anchor
        parent.add(model);

        // ── Optional lightweight fake glow shell ──
        // Cheap back-side transparent sphere, sized from the model bounds.
        // No bloom, no postprocessing, no per-frame work.
        const glow = createGlowShell(model);
        if (glow) parent.add(glow);

        // Mark model as loaded in state
        arStore.setState({ modelLoaded: true });

        console.log('[AR] Artifact loaded successfully');

        resolve({
          update() {
            model.rotation.y += ARTIFACT_CONFIG.rotationSpeed;
          },

          dispose() {
            parent.remove(model);
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat) => mat.dispose());
                } else {
                  child.material?.dispose();
                }
              }
            });
            if (glow) {
              parent.remove(glow);
              glow.geometry.dispose();
              (glow.material as THREE.Material).dispose();
            }
          },
        });
      },

      // ── Progress ──
      (progress) => {
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          console.log(`[AR] Artifact loading: ${pct}%`);
        }
      },

      // ── Error ──
      (error) => {
        console.error('[AR] Artifact loading failed:', error);
        reject(error);
      },
    );
  });
}
