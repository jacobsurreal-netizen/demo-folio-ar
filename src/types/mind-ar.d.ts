/**
 * Type declarations for MindAR image tracking (Three.js integration).
 * MindAR v1.2.x has no official @types package.
 * We declare only the subset used by this project.
 */

declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  import type { Scene, Camera, WebGLRenderer, Group } from 'three';

  export interface MindARThreeOptions {
    /** DOM element to mount the AR canvas into */
    container: HTMLElement;
    /** Path to compiled .mind image target file */
    imageTargetSrc: string;
    /** Custom loading UI — set to 'no' to disable default */
    uiLoading?: string;
    /** Custom error UI — set to 'no' to disable default */
    uiError?: string;
    /** One-euro filter cutoff frequency (lower = smoother, default 0.001) */
    filterMinCF?: number;
    /** One-euro filter speed coefficient (higher = less delay, default 1000) */
    filterBeta?: number;
    /** Frames required before target-found fires (default 5) */
    warmupTolerance?: number;
    /** Frames required before target-lost fires (default 5) */
    missTolerance?: number;
    /** Max number of simultaneous tracked targets */
    maxTrack?: number;
  }

  export interface MindARAnchor {
    /** Three.js group attached to this anchor — add content here */
    group: Group;
    /** Callback fired when the target image is detected */
    onTargetFound: (() => void) | null;
    /** Callback fired when the target image is lost */
    onTargetLost: (() => void) | null;
    /** CSS anchor for DOM overlay content */
    css?: unknown;
  }

  export class MindARThree {
    constructor(options: MindARThreeOptions);

    /** Three.js WebGLRenderer managed by MindAR */
    renderer: WebGLRenderer;
    /** Three.js Scene managed by MindAR */
    scene: Scene;
    /** Three.js Camera managed by MindAR (perspective, auto-calibrated) */
    camera: Camera;

    /** Register an anchor for a target image by index */
    addAnchor(targetIndex: number): MindARAnchor;

    /** Start camera stream and begin tracking */
    start(): Promise<void>;

    /** Stop camera stream and tracking */
    stop(): void;

    /** Switch between front/back camera */
    switchCamera(): void;
  }
}
