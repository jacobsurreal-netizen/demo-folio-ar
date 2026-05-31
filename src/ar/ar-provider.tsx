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
import { loadArtifact, type ArtifactHandle } from './ar-artifact';
import { arStore } from '../state/store';
import { useAppState } from '../hooks/use-app-state';

const AR_SHUTDOWN_EVENT = 'surreal-ar-shutdown-request';

export function ARProvider() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<any>(null);
  const artifactHandleRef = useRef<ArtifactHandle | null>(null);
  const lostTimeoutRef = useRef<number | null>(null);
  const startInFlightRef = useRef(false);
  const arSessionRef = useRef(0);
  const [initError, setInitError] = useState<string | null>(null);

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

    if (mindarRef.current) {
      const renderer = mindarRef.current.renderer;
      renderer?.setAnimationLoop(null);
      stopMindARMedia(mindarRef.current);
      try {
        mindarRef.current.stop();
      } catch (error) {
        console.warn('[AR] MindAR stop failed during cleanup:', error);
      }
      if (renderer) {
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
    arStore.setState({ arReady: false, tracking: 'awaiting', signalStrength: 0, modelLoaded: false });
  }, [stopAllVideoTracks, stopMindARMedia]);

  const startAR = useCallback(async () => {
    if (!containerRef.current) return;
    if (arReady || startInFlightRef.current) return;

    try {
      cleanupAR();
      startInFlightRef.current = true;
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
        try {
          mindarThree.stop();
        } catch {
          // Instance was already invalidated by page lifecycle cleanup.
        }
        return;
      }
      artifactHandleRef.current = artifactHandle;

      // Start AR
      await mindarThree.start();
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

    } catch (error: any) {
      console.error('[AR] Initialization failed:', error);
      const msg = error.message?.includes('404')
        ? 'Marker target file not found (.mind)'
        : 'Failed to access camera or initialize AR';
      setInitError(msg);
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

    // 2. Artifact Tint (Traverse anchor groups)
    // We only apply a subtle emissive tint to preserve the original material integrity.
    scene.traverse((obj: any) => {
      if (obj.isMesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat: any) => {
          if (mat.emissive) {
            mat.emissive.set(modeColor);
            mat.emissiveIntensity = arStore.getState().hudMode === 'IR' ? 0.5 : 0.2;
          }
        });
      }
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
  }, [cleanupAR]);

  return (
    <div className="ar-layer" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {!arReady && !initError && (
        <div className="permission-gate" style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)'
        }}>
          <button
            onClick={startAR}
            className="mono"
            style={{
              padding: '16px 32px',
              background: 'transparent',
              border: '1px solid var(--hud-accent)',
              color: 'var(--hud-accent)',
              cursor: 'pointer',
              fontSize: 'var(--text-base)',
              letterSpacing: '0.1em'
            }}
          >
            Initialize System
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
