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

// Explicit pulse profiles for clarity and tuning
const ORB_PULSE_PROFILE_DRIFT = {
  amountMul: 0.45,
  speedMul: 0.85,
  intensityScale: 0.85,
  amp: 0.28,
};

const ORB_PULSE_PROFILE_STABLE = {
  amountMul: 1.8,
  speedMul: 1.05,
  intensityScale: 1.8,
  amp: 0.95,
};

// Peak color targets for modes (arctic white-blue for COLOR, amber for IR)
const COLOR_PEAK = new THREE.Color(0xd8ffff);
const IR_PEAK = new THREE.Color(0xffd66b);

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

    const primary = (Array.isArray(child.material) ? child.material[0] : child.material) as AuditableMaterial & {
      emissiveIntensity?: number;
    };
    if (typeof primary.emissiveIntensity === 'number') {
      child.userData.orbBaseEmissiveIntensity = ORB_EMISSIVE_INTENSITY;
      // Store base emissive color and a temp color buffer for per-frame pulses
      child.userData.orbBaseEmissiveColor = (primary.emissive ? primary.emissive.clone() : new THREE.Color(ORB_EMISSIVE_COLOR));
      child.userData.pulseColorBuffer = new THREE.Color();
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

function pulseTurquoiseOrb(
  target: OrbPulseTarget,
  elapsedSeconds: number,
  opts?: {
    pulseAmount?: number;
    pulseSpeed?: number;
    stabilizationProgress?: number;
    resonanceState?: 'SEARCHING' | 'ACQUIRED_UNSTABLE' | 'LOCKING' | 'CONFIRMED' | 'LOST';
    hudMode?: 'COLOR' | 'IR';
    // optional overrides for intensity/amp (from profile)
    intensityScaleOverride?: number;
    ampOverride?: number;
  },
): void {
  const pulseSpeed = opts?.pulseSpeed ?? ORB_PULSE_SPEED;
  const pulseAmount = opts?.pulseAmount ?? ORB_PULSE_AMOUNT;
  const stab = opts?.stabilizationProgress ?? 0;
  const resonance = opts?.resonanceState ?? 'SEARCHING';
  const hudMode = opts?.hudMode ?? 'COLOR';

  // Smooth sine wave for breathing effect (deterministic)
  const wave = 0.5 + 0.5 * Math.sin(elapsedSeconds * pulseSpeed);

  // Emissive intensity modulation: pulsing glow, dampened by stabilization progress
  const intensityMultiplier = 1 - pulseAmount + pulseAmount * wave;
  // As stabilization progresses, reduce pulse amplitude slightly
  const dampenedMultiplier = 1 - stab * 0.6 + intensityMultiplier * (stab * 0.6);

  // Intensity scaling by ritual state (can be overridden by profile)
  let intensityScale = opts?.intensityScaleOverride ?? 1;
  if (!opts?.intensityScaleOverride) {
    switch (resonance) {
      case 'ACQUIRED_UNSTABLE':
        intensityScale = ORB_PULSE_PROFILE_DRIFT.intensityScale;
        break;
      case 'LOCKING':
        intensityScale = 1.2 * (1 - stab) + 0.8;
        break;
      case 'CONFIRMED':
        intensityScale = ORB_PULSE_PROFILE_STABLE.intensityScale;
        break;
      case 'LOST':
        intensityScale = 0.6;
        break;
      default:
        intensityScale = 1;
    }
  }

  target.material.emissiveIntensity = target.getBaseIntensity() * dampenedMultiplier * intensityScale;

  // Scale breathing: very subtle, smooth expansion/contraction, also dampened
  const scaleAmp = ORB_SCALE_PULSE_AMOUNT * (1 - stab * 0.7);
  const scaleMultiplier = 1 + scaleAmp * (wave - 0.5) * 2;
  target.mesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);

  // Color interpolation between base and peak depending on hudMode and resonance.
  const mesh = target.mesh as unknown as THREE.Mesh & { userData: { orbBaseEmissiveColor?: THREE.Color; pulseColorBuffer?: THREE.Color } };
  const baseColor: THREE.Color = mesh.userData.orbBaseEmissiveColor ?? new THREE.Color(ORB_EMISSIVE_COLOR);
  const tempColor: THREE.Color = mesh.userData.pulseColorBuffer ?? new THREE.Color();
  const peak = hudMode === 'IR' ? IR_PEAK : COLOR_PEAK;

  // Amplitude for color mixing by ritual state (can be overridden)
  let amp = opts?.ampOverride ?? 0.12;
  if (!opts?.ampOverride) {
    switch (resonance) {
      case 'ACQUIRED_UNSTABLE':
        amp = ORB_PULSE_PROFILE_DRIFT.amp;
        break;
      case 'LOCKING':
        amp = 0.9 * (1 - stab) + 0.25;
        break;
      case 'CONFIRMED':
        amp = ORB_PULSE_PROFILE_STABLE.amp;
        break;
      case 'LOST':
        amp = 0.12;
        break;
      default:
        amp = 0.12;
    }
  }

  const mixFactor = Math.min(1, amp * wave);
  // tempColor = baseColor lerp peak by mixFactor
  tempColor.copy(baseColor).lerp(peak, mixFactor);
  if (target.material && (target.material as unknown as { emissive: THREE.Color }).emissive) {
    (target.material as unknown as { emissive: THREE.Color }).emissive.copy(tempColor);
  }
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
        let confirmedAt: number | null = null;
        // Auto-rotation accumulators (kept internal to artifact instance)
        let autoRotationY = model.rotation.y ?? 0;
        const autoRotationX = model.rotation.x ?? 0;

        // Attach to anchor
        parent.add(model);

        // Mark model as loaded in state
        arStore.setState({ modelLoaded: true });

        console.log('[AR] Artifact loaded successfully');

        resolve({
          update() {
            // Read current app state each frame (read-only)
            const state = arStore.getState();
            const resonance = state.resonanceState;
            const progress = Math.max(0, Math.min(1, state.stabilizationProgress ?? 0));

            // Rotation speed modulation (lock slows rotation as progress increases)
            let rotationSpeed: number = ARTIFACT_CONFIG.rotationSpeed;

            if (resonance === 'LOCKING') {
              rotationSpeed = ARTIFACT_CONFIG.rotationSpeed * (1 - 0.6 * progress);
            } else if (resonance === 'CONFIRMED') {
              // Stop automatic rotation so manual control is immediately responsive
              rotationSpeed = 0;
            } else if (resonance === 'ACQUIRED_UNSTABLE') {
              // Slight deterministic wobble in rotation rate (no randomness)
              const t = (performance.now() - pulseStart) * 0.001;
              rotationSpeed = ARTIFACT_CONFIG.rotationSpeed * (1 + 0.12 * Math.sin(t * 1.7));
            } else if (resonance === 'LOST') {
              rotationSpeed = ARTIFACT_CONFIG.rotationSpeed * 0.65;
            }

            // Advance internal auto-rotation accumulator
            autoRotationY += rotationSpeed;

            // Manual rotation offsets are only applied when locked + confirmed
            const yawOffset = state.tracking === 'locked' && resonance === 'CONFIRMED' ? (state.artifactRotationYaw ?? 0) : 0;
            const pitchOffsetRaw = state.tracking === 'locked' && resonance === 'CONFIRMED' ? (state.artifactRotationPitch ?? 0) : 0;
            const PITCH_MIN = -0.45;
            const PITCH_MAX = 0.45;
            const pitchOffset = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchOffsetRaw));

            // Apply composed rotation: auto rotation + manual offsets. Do not modify anchor/group transforms.
            model.rotation.y = autoRotationY + yawOffset;
            model.rotation.x = autoRotationX + pitchOffset;

            if (pulseTarget) {
              const elapsed = (performance.now() - pulseStart) * 0.001;

              // Determine pulse parameters by resonance state using named profiles
              let pulseAmount = ORB_PULSE_AMOUNT;
              let pulseSpeed = ORB_PULSE_SPEED;

              if (resonance === 'ACQUIRED_UNSTABLE') {
                // Use "drift" profile for unstable acquired
                pulseAmount = ORB_PULSE_AMOUNT * ORB_PULSE_PROFILE_DRIFT.amountMul;
                pulseSpeed = ORB_PULSE_SPEED * ORB_PULSE_PROFILE_DRIFT.speedMul;
              } else if (resonance === 'LOCKING') {
                // Make pulse amplitude reduce as progress rises; rhythm can tighten
                pulseAmount = ORB_PULSE_AMOUNT * (1 - 0.7 * progress);
                pulseSpeed = ORB_PULSE_SPEED * (1 + 0.45 * progress);
              } else if (resonance === 'CONFIRMED') {
                // Use calmer "stable" profile once confirmed
                pulseAmount = ORB_PULSE_AMOUNT * ORB_PULSE_PROFILE_STABLE.amountMul;
                pulseSpeed = ORB_PULSE_SPEED * ORB_PULSE_PROFILE_STABLE.speedMul;
              } else if (resonance === 'LOST') {
                pulseAmount = ORB_PULSE_AMOUNT * 0.25;
                pulseSpeed = ORB_PULSE_SPEED * 0.6;
              }

              const hudMode = arStore.getState().hudMode;
              pulseTurquoiseOrb(pulseTarget, elapsed, { pulseAmount, pulseSpeed, stabilizationProgress: progress, resonanceState: resonance, hudMode });

              // One-time CONFIRMED spike (subtle): schedule a short spike when state first enters CONFIRMED
              if (resonance === 'CONFIRMED' && confirmedAt === null) {
                confirmedAt = performance.now();
              }

              if (confirmedAt !== null) {
                const since = (performance.now() - confirmedAt) * 0.001;
                if (since < 0.6) {
                  // gentle spike that decays quickly
                  const spike = 1 + 0.9 * (1 - since / 0.6);
                  const base = pulseTarget.getBaseIntensity();
                  pulseTarget.material.emissiveIntensity = Math.max(pulseTarget.material.emissiveIntensity ?? base, base * spike);
                } else {
                  // clear confirmation stamp after decay
                  confirmedAt = null;
                }
              }
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
