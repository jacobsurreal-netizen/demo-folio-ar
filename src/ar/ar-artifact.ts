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

        // Attach to anchor
        parent.add(model);

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
