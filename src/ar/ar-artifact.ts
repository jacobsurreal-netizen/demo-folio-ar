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

/** Confirmed GLB mesh names — do not apply orb pass to other meshes. */
export const ARTIFACT_MESH_TURQUOISE_ORB = 'TurquoiseOrb';
export const ARTIFACT_MESH_BLACK_TETRAHEDRON = 'BlackTetrahedron';

const ORB_BASE_COLOR = 0x3dd9c8;
const ORB_EMISSIVE_COLOR = 0x00e8d4;
const ORB_EMISSIVE_INTENSITY = 0.78; // Bright, glowing anomaly core
const ORB_METALNESS = 0.12; // Slightly more reflective for energetic feel
const ORB_ROUGHNESS = 0.28; // Glassier, less matte plastic-y
const ORB_PULSE_SPEED = 1.3; // Slower breathing: ~1.3 cycles/sec
const ORB_PULSE_AMOUNT = 0.38; // Aggressive pulse: 38% amplitude for more visible anomaly energy
const ORB_SCALE_PULSE_AMOUNT = 0.038; // More visible breathing: ±3.8% scale modulation

/** Handle returned by loadArtifact for per-frame updates */
export interface ArtifactHandle {
  /** Call every frame inside the render loop */
  update: () => void;
  /** Dispose geometry and materials */
  dispose: () => void;
}

type AuditableMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
};

function formatNumber(value: number | undefined): number | null {
  return typeof value === 'number' ? Number(value.toFixed(4)) : null;
}

function formatColor(color: THREE.Color | undefined): string | null {
  return color ? `#${color.getHexString()}` : null;
}

function formatBoxSize(box: THREE.Box3): string {
  const size = box.getSize(new THREE.Vector3());
  return `${formatNumber(size.x)}, ${formatNumber(size.y)}, ${formatNumber(size.z)}`;
}

/** DEV-only structure audit for the GLB before any material identity work. */
function logArtifactStructure(model: THREE.Object3D): void {
  if (!import.meta.env.DEV) return;

  const rows: Array<Record<string, unknown>> = [];

  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const geometry = child.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes.position;
    const vertexCount = typeof position?.count === 'number' ? position.count : null;
    const box = new THREE.Box3().setFromObject(child);
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material, materialIndex) => {
      const mat = material as AuditableMaterial;

      rows.push({
        meshName: child.name || '(unnamed mesh)',
        materialIndex,
        materialName: mat.name || '(unnamed material)',
        materialType: mat.type,
        color: formatColor(mat.color),
        emissive: formatColor(mat.emissive),
        emissiveIntensity: formatNumber(mat.emissiveIntensity),
        metalness: formatNumber(mat.metalness),
        roughness: formatNumber(mat.roughness),
        transparent: mat.transparent,
        opacity: formatNumber(mat.opacity),
        vertexCount,
        boundingBoxSize: formatBoxSize(box),
      });
    });
  });

  console.groupCollapsed(`[AR] Artifact mesh/material audit (${rows.length} material slot${rows.length === 1 ? '' : 's'})`);
  console.table(rows);
  console.groupEnd();
}

type OrbPulseTarget = {
  material: THREE.Material & { emissiveIntensity?: number };
  mesh: THREE.Mesh; // For scale breathing animation
  getBaseIntensity: () => number;
};

/**
 * Improve TurquoiseOrb readability only. BlackTetrahedron and unknown meshes
 * are left untouched. No fake glow shell.
 */
function applyTurquoiseOrbMaterial(model: THREE.Object3D): {
  pulseTarget: OrbPulseTarget | null;
  replacedMaterials: THREE.Material[];
} {
  const replacedMaterials: THREE.Material[] = [];
  let pulseTarget: OrbPulseTarget | null = null;

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name !== ARTIFACT_MESH_TURQUOISE_ORB) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const nextMaterials = materials.map((material) => {
      const mat = material as AuditableMaterial;

      if (mat.emissive) {
        if (mat.color) mat.color.setHex(ORB_BASE_COLOR);
        mat.emissive.setHex(ORB_EMISSIVE_COLOR);
        mat.emissiveIntensity = ORB_EMISSIVE_INTENSITY;
        if (typeof mat.metalness === 'number') mat.metalness = ORB_METALNESS;
        if (typeof mat.roughness === 'number') mat.roughness = ORB_ROUGHNESS;
        mat.needsUpdate = true;
        return mat;
      }

      const previous = mat;
      const basic = new THREE.MeshBasicMaterial({
        color: ORB_BASE_COLOR,
        toneMapped: false,
      });
      basic.name = `${mat.name || 'TurquoiseOrb'}_readable`;
      replacedMaterials.push(previous);
      return basic;
    });

    child.material = nextMaterials.length === 1 ? nextMaterials[0] : nextMaterials;

    const primary = (Array.isArray(child.material) ? child.material[0] : child.material) as THREE.Material & {
      emissiveIntensity?: number;
    };
    if (typeof primary.emissiveIntensity === 'number') {
      child.userData.orbBaseEmissiveIntensity = ORB_EMISSIVE_INTENSITY;
      pulseTarget = {
        material: primary,
        mesh: child, // Capture mesh for scale breathing
        getBaseIntensity: () =>
          (child.userData.orbBaseEmissiveIntensity as number | undefined) ?? ORB_EMISSIVE_INTENSITY,
      };
    }
  });

  return { pulseTarget, replacedMaterials };
}

function pulseTurquoiseOrb(target: OrbPulseTarget, elapsedSeconds: number): void {
  // Smooth sine wave for breathing effect
  const wave = 0.5 + 0.5 * Math.sin(elapsedSeconds * ORB_PULSE_SPEED);
  
  // Emissive intensity modulation: pulsing glow
  const intensityMultiplier = 1 - ORB_PULSE_AMOUNT + ORB_PULSE_AMOUNT * wave;
  target.material.emissiveIntensity = target.getBaseIntensity() * intensityMultiplier;
  
  // Scale breathing: very subtle, smooth expansion/contraction
  const scaleMultiplier = 1 + ORB_SCALE_PULSE_AMOUNT * (wave - 0.5) * 2;
  target.mesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
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

        logArtifactStructure(model);

        const { pulseTarget, replacedMaterials } = applyTurquoiseOrbMaterial(model);
        const pulseStart = performance.now();

        // Attach to anchor
        parent.add(model);

        // Mark model as loaded in state
        arStore.setState({ modelLoaded: true });

        console.log('[AR] Artifact loaded successfully');

        resolve({
          update() {
            model.rotation.y += ARTIFACT_CONFIG.rotationSpeed;
            if (pulseTarget) {
              const elapsed = (performance.now() - pulseStart) * 0.001;
              pulseTurquoiseOrb(pulseTarget, elapsed);
            }
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
            replacedMaterials.forEach((mat) => mat.dispose());
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
