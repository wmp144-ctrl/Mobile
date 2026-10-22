import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/** پس از مدت تعیین‌شده بی‌کاری، قفل صفحه را فعال می‌کند */
export function useIdleLock(minutes: number, enabled: boolean, onIdle: () => void): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    const timeoutMs = minutes * 60_000;
    let lastActivity = Date.now();
    let lastUpdate = 0;

    const bump = () => {
      const now = Date.now();
      if (now - lastUpdate < 1_000) return;
      lastUpdate = now;
      lastActivity = now;
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, bump, { passive: true });
    }
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity >= timeoutMs) {
        onIdleRef.current();
      }
    }, 5_000);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, bump);
      }
      window.clearInterval(interval);
    };
  }, [minutes, enabled]);
}
