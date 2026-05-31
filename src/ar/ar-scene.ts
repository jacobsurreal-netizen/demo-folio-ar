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
  // Soft omnidirectional light so the artifact stays readable. Lowered
  // from a flat wash to give the key light more contrast / silhouette.
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  // ── Key light ──
  // Directional light for silhouette definition. Raised slightly for a
  // stronger read against the camera feed. No shadows — castShadow stays
  // false (default). (ARProvider may retint this on HUD mode change.)
  const key = new THREE.DirectionalLight(0xffffff, 0.65);
  key.position.set(0.5, 1.5, 1.0);
  scene.add(key);

  // ── Fill light ──
  // Dim counter-light to prevent pure-black faces on the artifact.
  const fill = new THREE.DirectionalLight(0xccddff, 0.2);
  fill.position.set(-1.0, 0.5, -0.5);
  scene.add(fill);
}
