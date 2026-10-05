'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export type GpsStatus = 'off' | 'unsupported' | 'waiting' | 'sending' | 'denied' | 'error';

export const GPS_LABEL: Record<GpsStatus, string> = {
  off: 'GPS: tắt',
  unsupported: 'GPS: trình duyệt không hỗ trợ định vị',
  waiting: 'GPS: đang chờ tín hiệu...',
  sending: 'GPS: đang gửi',
  denied: 'GPS: không có quyền truy cập vị trí',
  error: 'GPS: lỗi gửi vị trí',
};

const MIN_INTERVAL_MS = 10_000;
const finite = (n: number | null) => (n !== null && Number.isFinite(n) ? n : undefined);

/** Watches the device position while `enabled` and posts it to the trip at most every 10 s. */
export function useLocationSender(tripId: string, enabled: boolean) {
  const [status, setStatus] = useState<GpsStatus>('off');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const position = useRef<{ lat: number; lng: number } | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('waiting');
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        position.current = { lat, lng };
        const now = Date.now();
        if (now - lastSent.current < MIN_INTERVAL_MS) return;
        lastSent.current = now;
        api(`/driver/trips/${tripId}/location`, { method: 'POST', body: { lat, lng, speed: finite(pos.coords.speed), heading: finite(pos.coords.heading) } })
          .then(() => {
            setStatus('sending');
            setLastSentAt(new Date());
          })
          .catch(() => setStatus('error'));
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [tripId, enabled]);

  return { status, lastSentAt, position };
}
