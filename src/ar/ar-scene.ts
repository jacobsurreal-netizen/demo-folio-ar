/**
 * SURREAL EXP LAB // DEMO V1
 * Three.js scene factory.
 *
 * Creates the minimal scene environment for the AR artifact.
 * MindAR owns the renderer, camera, and canvas — this module only
 * configures the scene contents (lights, fog, environment).
 *
 * No shadows. No environment maps. No postprocessing.
 */

import * as THREE from 'three';

/**
 * Configure the Three.js scene provided by MindAR.
 * MindAR creates its own scene — we add lights and atmosphere to it.
 */
export function setupScene(scene: THREE.Scene): void {
  // ── Ambient fill ──
  // Soft omnidirectional light so the artifact is always readable.
  // Slightly increased for BlackTetrahedron readability
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  // ── Key light ──
  // Subtle directional light for silhouette definition.
  // No shadows — castShadow stays false (default).
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(0.5, 1.5, 1.0);
  scene.add(key);

  // ── Fill light ──
  // Very dim counter-light to prevent pure-black faces on the artifact.
  // Slightly brighter and warmer for subtle edge lift
  const fill = new THREE.DirectionalLight(0xdde6ff, 0.19);
  fill.position.set(-1.0, 0.5, -0.5);
  scene.add(fill);
}
