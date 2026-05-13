/**
 * SURREAL EXP LAB // DEMO V1
 * Parallax hook — mouse input (desktop) + gyro stub (mobile, disabled).
 *
 * Returns normalised X/Y offsets in range [-1, 1] that HUD layers
 * multiply by their own depth factors for layered parallax.
 *
 * Gyro infrastructure is wired but disabled by default.
 * To enable: set GYRO_ENABLED = true and test on a physical device.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/** Master toggle for device orientation parallax */
const GYRO_ENABLED = false;

/** Smoothing factor for lerp (0 = frozen, 1 = instant) */
const SMOOTHING = 0.08;

export interface ParallaxOffset {
  x: number;
  y: number;
}

export function useParallax(): ParallaxOffset {
  const [currentOffset, setCurrentOffset] = useState<ParallaxOffset>({ x: 0, y: 0 });
  const target = useRef<ParallaxOffset>({ x: 0, y: 0 });
  const raf = useRef<number>(0);

  const lerp = useCallback((a: number, b: number, t: number) => a + (b - a) * t, []);

  useEffect(() => {
    // ── Mouse input ──
    const handleMouse = (e: MouseEvent) => {
      target.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };

    // ── Gyro input ──
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (!GYRO_ENABLED) return;
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      target.current = {
        x: Math.max(-1, Math.min(1, gamma / 45)),
        y: Math.max(-1, Math.min(1, (beta - 45) / 45)),
      };
    };

    // ── Smoothing loop ──
    const tick = () => {
      setCurrentOffset((prev) => ({
        x: lerp(prev.x, target.current.x, SMOOTHING),
        y: lerp(prev.y, target.current.y, SMOOTHING),
      }));
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouse, { passive: true });
    if (GYRO_ENABLED) {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    }

    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouse);
      if (GYRO_ENABLED) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
      cancelAnimationFrame(raf.current);
    };
  }, [lerp]);

  return currentOffset;
}
