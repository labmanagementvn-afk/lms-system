'use client';

import { useEffect, useRef } from 'react';
import { API_URL, getToken } from './api';

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  studentId: string | null;
  announcementId: string | null;
  readAt: string | null;
  createdAt: string;
  student?: { id: string; code: string; fullName: string } | null;
  announcement?: { id: string; kind: string; eventAt: string | null; location: string | null; rsvp: boolean; responses: { response: string }[] } | null;
}

/**
 * Subscribes to the signed-in user's live notification feed (server-sent events).
 * Browsers cannot set headers on EventSource, so the token travels as a query parameter.
 */
export function useNotificationStream(onNotification: (n: AppNotification) => void, enabled = true) {
  const handler = useRef(onNotification);
  handler.current = onNotification;

  useEffect(() => {
    const token = getToken();
    if (!enabled || !token || typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API_URL}/notifications/stream?access_token=${encodeURIComponent(token)}`);
    const listener = (e: MessageEvent) => {
      try {
        handler.current(JSON.parse(e.data));
      } catch {
        // keepalive or malformed frame
      }
    };
    source.addEventListener('notification', listener);
    return () => {
      source.removeEventListener('notification', listener);
      source.close();
    };
  }, [enabled]);
}
