/**
 * SURREAL EXP LAB // DEMO V1
 * AR Provider — MindAR lifecycle manager.
 *
 * This component owns the imperative Three.js and MindAR instances.
 * It manages:
 * - Initialization and cleanup
 * - Camera stream lifecycle
 * - Tracking callbacks (Found/Lost)
 * - Render loop
 * - Syncing state back to the ARStore
 *
 * Mobile safety:
 * - Handled camera permission gesture requirement
 * - Proper cleanup on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { ACTIVE_MARKER, MINDAR_CONFIG, LOST_TIMEOUT_MS } from './ar-config';
import { setupScene } from './ar-scene';
import { ARTIFACT_MESH_TURQUOISE_ORB, loadArtifact, type ArtifactHandle } from './ar-artifact';
import { arStore } from '../state/store';
import { useAppState } from '../hooks/use-app-state';

const AR_SHUTDOWN_EVENT = 'surreal-ar-shutdown-request';

const getARInitErrorMessage = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : typeof error === 'string'
        ? error
        : '';

  const name = error instanceof DOMException
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';

  if (message.includes('404')) {
    return 'Marker target file not found (.mind)';
  }

  if (name === 'NotFoundError' || message.includes('NotFoundError') || message.includes('Requested device not found')) {
    return 'CAMERA DEVICE NOT FOUND';
  }

  return 'CAMERA INITIALIZATION FAILED';
};

export function ARProvider() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<any>(null);
  const artifactHandleRef = useRef<ArtifactHandle | null>(null);
  const lostTimeoutRef = useRef<number | null>(null);
  const startInFlightRef = useRef(false);
  const mindarStartedRef = useRef(false);
  const arSessionRef = useRef(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [bootStart, setBootStart] = useState<number | null>(null);
  const MIN_BOOT_MS = 2300; // minimum boot overlay duration (ms)
  const [startupNeedsGesture, setStartupNeedsGesture] = useState(false);
  const STARTUP_TIMEOUT_MS = 5000; // fallback timeout to surface gesture requirement

  const { arReady } = useAppState();

  const stopMediaStream = useCallback((stream: unknown) => {
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const stopVideoTracks = useCallback((root: HTMLElement | null) => {
    root?.querySelectorAll('video').forEach((video) => {
      stopMediaStream(video.srcObject);
      video.pause();
      video.removeAttribute('src');
      video.srcObject = null;
      video.load();
    });
  }, [stopMediaStream]);

  const stopMindARMedia = useCallback((mindar: any) => {
    const possibleVideos = [
      mindar?.video,
      mindar?.inputVideo,
      mindar?.controller?.video,
      mindar?.controller?.inputVideo,
    ];

    possibleVideos.forEach((video) => {
      if (video instanceof HTMLVideoElement) {
        stopMediaStream(video.srcObject);
        video.pause();
        video.removeAttribute('src');
        video.srcObject = null;
        video.load();
      }
    });
  }, [stopMediaStream]);

  const stopAllVideoTracks = useCallback(() => {
    stopVideoTracks(containerRef.current);
    stopVideoTracks(document.body);
  }, [stopVideoTracks]);

  const cleanupAR = useCallback(() => {
    arSessionRef.current += 1;

    if (lostTimeoutRef.current) {
      clearTimeout(lostTimeoutRef.current);
      lostTimeoutRef.current = null;
    }

    const mindar = mindarRef.current;
    const wasStarted = mindarStartedRef.current;
    mindarStartedRef.current = false;

    if (mindar) {
      const renderer = mindar.renderer;
      renderer?.setAnimationLoop(null);
      stopMindARMedia(mindar);
      if (wasStarted && typeof mindar.stop === 'function') {
        try {
          mindar.stop();
        } catch (error) {
          console.warn('[AR] MindAR stop failed during cleanup:', error);
        }
      }
      if (renderer && typeof renderer.dispose === 'function') {
        renderer.dispose();
      }
    }

    if (artifactHandleRef.current) {
      artifactHandleRef.current.dispose();
      artifactHandleRef.current = null;
    }

    stopAllVideoTracks();
    containerRef.current?.replaceChildren();
    mindarRef.current = null;
    startInFlightRef.current = false;
    setBooting(false);
    setBootStart(null);
    setStartupNeedsGesture(false);
    arStore.setState({ arReady: false, tracking: 'awaiting', signalStrength: 0, modelLoaded: false });
  }, [stopAllVideoTracks, stopMindARMedia]);

  const startAR = useCallback(async () => {
    if (!containerRef.current) return;
    if (arReady || startInFlightRef.current) return;

    try {
      cleanupAR();
      startInFlightRef.current = true;
      // show non-interactive boot overlay
      setBooting(true);
      setStartupNeedsGesture(false);
      setBootStart(Date.now());
      const sessionId = arSessionRef.current;
      setInitError(null);
      console.log('[AR] Initializing MindAR with target:', ACTIVE_MARKER);

      const mindarOptions = {
        container: containerRef.current,
        imageTargetSrc: ACTIVE_MARKER,
        filterMinCF: MINDAR_CONFIG.filterMinCF,
        filterBeta: MINDAR_CONFIG.filterBeta,
        warmupTolerance: MINDAR_CONFIG.warmupTolerance,
        missTolerance: MINDAR_CONFIG.missTolerance,
        uiScanning: 'no',
        uiLoading: 'no',
        uiError: 'no',
      };

      const mindarThree = new MindARThree(mindarOptions);

      const { renderer, scene, camera } = mindarThree;
      mindarRef.current = mindarThree;

      // Setup lighting and environment
      setupScene(scene);

      // Setup Tracking callbacks
      const anchor = mindarThree.addAnchor(0);

      anchor.onTargetFound = () => {
        console.log('[AR] Target Found');
        if (lostTimeoutRef.current) {
          clearTimeout(lostTimeoutRef.current);
          lostTimeoutRef.current = null;
        }
        arStore.setState({ tracking: 'locked', signalStrength: 1 });
      };

      anchor.onTargetLost = () => {
        console.log('[AR] Target Lost');
        arStore.setState({ tracking: 'lost', signalStrength: 0 });

        // Set timeout to revert to awaiting
        if (lostTimeoutRef.current) clearTimeout(lostTimeoutRef.current);
        lostTimeoutRef.current = window.setTimeout(() => {
          arStore.setState({ tracking: 'awaiting' });
          lostTimeoutRef.current = null;
        }, LOST_TIMEOUT_MS);
      };

      // Load the artifact
      const artifactHandle = await loadArtifact(anchor.group);
      if (arSessionRef.current !== sessionId) {
        artifactHandle.dispose();
        renderer.dispose();
        return;
      }
      artifactHandleRef.current = artifactHandle;

      // Start AR
      await mindarThree.start();
      mindarStartedRef.current = true;
      if (arSessionRef.current !== sessionId) {
        cleanupAR();
        return;
      }
      console.log('[AR] MindAR Started');
      arStore.setState({ arReady: true });
      startInFlightRef.current = false;

      // Render Loop
      renderer.setAnimationLoop(() => {
        if (artifactHandleRef.current) {
          artifactHandleRef.current.update();
        }
        renderer.render(scene, camera);
      });

    } catch (error: unknown) {
      console.error('[AR] Initialization failed:', error);
      setInitError(getARInitErrorMessage(error));
      cleanupAR();
    }
  }, [arReady, cleanupAR]);

  const restartAR = useCallback(() => {
    cleanupAR();
    void startAR();
  }, [cleanupAR, startAR]);

  // ── Mode Response ──
  // Update scene lighting and artifact materials when hudMode changes.
  useEffect(() => {
    if (!arReady || !mindarRef.current) return;

    const { scene } = mindarRef.current;
    const modeColor = arStore.getState().hudMode === 'IR' ? 0xff3333 : 0x00f2ff;

    // 1. Update Directional Lights
    scene.traverse((obj: any) => {
      if (obj instanceof THREE.DirectionalLight) {
        // Shift key light towards mode color
        obj.color.set(modeColor);
        obj.intensity = arStore.getState().hudMode === 'IR' ? 0.8 : 0.5;
      }
    });

    // 2. TurquoiseOrb emissive tint only — BlackTetrahedron stays untouched.
    const orbBaseIntensity = arStore.getState().hudMode === 'IR' ? 0.5 : 0.5; // COLOR mode now matches IR brightness
    const isColorMode = arStore.getState().hudMode === 'COLOR';
    scene.traverse((obj: any) => {
      if (!obj.isMesh || obj.name !== ARTIFACT_MESH_TURQUOISE_ORB || !obj.material) return;

      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat: any) => {
        if (mat.emissive) {
          mat.emissive.set(modeColor);
          mat.emissiveIntensity = orbBaseIntensity;
          obj.userData.orbBaseEmissiveIntensity = orbBaseIntensity;
        }
        // COLOR mode OVERDRIVE: maximum metalness + aggressive roughness reduction for anomalous energy core
        if (isColorMode && typeof mat.metalness === 'number' && typeof mat.roughness === 'number') {
          mat.metalness = 1.0; // Maximum reflectivity: full metallic character
          mat.roughness = 0.12; // Aggressively smooth: sharp, glassy, energetic appearance
          mat.needsUpdate = true;
        } else if (!isColorMode && typeof mat.metalness === 'number' && typeof mat.roughness === 'number') {
          // IR mode: preserve baseline values
          mat.metalness = 0.12;
          mat.roughness = 0.28;
          mat.needsUpdate = true;
        }
      });
    });
  }, [arStore.getState().hudMode, arReady]);

  // Browser lifecycle cleanup prevents stale camera streams after tab/app switches.
  useEffect(() => {
    const handlePageHide = () => cleanupAR();
    const handleBeforeUnload = () => cleanupAR();
    const handleShutdownRequest = () => cleanupAR();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cleanupAR();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || document.visibilityState === 'visible') {
        cleanupAR();
        setInitError(null);
        // If pageshow/restore occurred, attempt to restart automatically
        void startAR();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener(AR_SHUTDOWN_EVENT, handleShutdownRequest);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener(AR_SHUTDOWN_EVENT, handleShutdownRequest);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanupAR();
    };
  }, [cleanupAR, startAR]);

  // Auto-start on mount
  useEffect(() => {
    void startAR();
  }, [startAR]);

  // Dismiss boot overlay only after AR ready AND minimum duration elapsed
  useEffect(() => {
    if (!booting || bootStart == null) return;
    if (!arReady) return;

    const elapsed = Date.now() - bootStart;
    const remaining = Math.max(0, MIN_BOOT_MS - elapsed);
    const t = window.setTimeout(() => {
      setBooting(false);
      setBootStart(null);
    }, remaining);

    return () => clearTimeout(t);
  }, [booting, bootStart, arReady]);

  // If booting has not reached arReady within STARTUP_TIMEOUT_MS, show fallback gesture button
  useEffect(() => {
    if (!booting || bootStart == null) {
      setStartupNeedsGesture(false);
      return;
    }
    if (arReady || initError) {
      setStartupNeedsGesture(false);
      return;
    }

    const t = window.setTimeout(() => {
      if (!arReady && !initError) setStartupNeedsGesture(true);
    }, STARTUP_TIMEOUT_MS);

    return () => clearTimeout(t);
  }, [booting, bootStart, arReady, initError]);

  return (
    <div className="ar-layer" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {booting && !initError && !startupNeedsGesture && (
        <div className="boot-overlay" style={{
          position: 'fixed',
          inset: 0,
          zIndex: 350,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          color: 'var(--hud-accent, #9be7ff)',
          pointerEvents: 'none',
          textAlign: 'center',
          padding: '24px'
        }}>
          <div className="mono" style={{ fontSize: '0.9rem', letterSpacing: '0.14em', opacity: 0.95 }}>
            <div style={{ marginBottom: '8px' }}>INIT RECON FIELD TOOL</div>
            <div style={{ marginBottom: '6px' }}>OPTICAL CHANNEL OPENING...</div>
            <div style={{ opacity: 0.85 }}>AWAITING CAMERA HANDSHAKE</div>
          </div>
        </div>
      )}

      {startupNeedsGesture && !initError && !arReady && (
        <div className="boot-fallback" style={{
          position: 'fixed',
          inset: 0,
          zIndex: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.92)',
          color: '#fff',
          textAlign: 'center',
          padding: '24px'
        }}>
          <div className="mono" style={{ fontSize: '1rem', letterSpacing: '0.12em', marginBottom: '12px' }}>CAMERA HANDSHAKE REQUIRED</div>
          <div style={{ marginBottom: '18px', opacity: 0.9 }}>Browser requires manual optical access.</div>
          <button
            onClick={() => {
              setStartupNeedsGesture(false);
              void startAR();
            }}
            className="mono"
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid var(--hud-accent)',
              color: 'var(--hud-accent)',
              cursor: 'pointer'
            }}
          >
            START FIELD TOOL
          </button>
        </div>
      )}

      {initError && (
        <div className="error-overlay" style={{
          position: 'fixed',
          inset: 0,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(20,0,0,0.95)',
          color: '#fff',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h2 className="mono" style={{ color: '#dc2626', marginBottom: '12px' }}>System Error</h2>
          <p style={{ marginBottom: '24px', opacity: 0.8 }}>{initError}</p>
          <button
            onClick={restartAR}
            className="mono"
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #fff',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Restart Scanner
          </button>
        </div>
      )}
    </div>
  );
}
