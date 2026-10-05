'use client';

// Leaflet map for the bus module. Load it with next/dynamic({ ssr: false }): Leaflet touches `window` on import.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ReactNode, useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'bus' | 'stop' | 'home';
  label: string;
  color?: string;
  popup?: ReactNode;
}

export interface BusMapProps {
  markers: MapMarker[];
  /** Optional track to draw under the markers. */
  track?: [number, number][];
  height?: number | string;
  /** Re-fit the view whenever a marker moves (a parent following one bus), not only when the set of markers changes. */
  follow?: boolean;
}

const HANOI: [number, number] = [21.0285, 105.8048];
const COLORS = { bus: '#1d4ed8', stop: '#f97316', home: '#16a34a' };
const BUS_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12v5z"/></svg>';
const HOME_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg>';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Next does not bundle Leaflet's marker images, so markers are drawn as HTML instead.
function icon(m: MapMarker) {
  const color = m.color ?? COLORS[m.kind];
  const glyph = m.kind === 'bus' ? BUS_SVG : m.kind === 'home' ? HOME_SVG : '<span style="font-size:11px;line-height:1">●</span>';
  const size = m.kind === 'bus' ? 30 : 22;
  const html = `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)">${glyph}</span>
    <span style="background:#fff;padding:1px 6px;border-radius:4px;font-size:12px;font-weight:600;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.3)">${escapeHtml(m.label)}</span>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

/** Fits the view to the markers whenever `fitKey` changes. */
function Fit({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  const latest = useRef(points);
  latest.current = points;
  useEffect(() => {
    const pts = latest.current;
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 15));
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  }, [map, fitKey]);
  return null;
}

export default function BusMap({ markers, track, height = 420, follow = false }: BusMapProps) {
  const points = markers.map((m) => [m.lat, m.lng] as [number, number]);
  const fitKey = (follow ? points.map((p) => p.join(',')) : markers.map((m) => m.id)).join(';');
  return (
    <MapContainer center={points[0] ?? HANOI} zoom={13} scrollWheelZoom style={{ height, width: '100%', borderRadius: 8 }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {track && track.length > 1 && <Polyline positions={track} pathOptions={{ color: COLORS.bus, weight: 3, opacity: 0.7 }} />}
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={icon(m)}>
          {m.popup && <Popup>{m.popup}</Popup>}
        </Marker>
      ))}
      <Fit points={points} fitKey={fitKey} />
    </MapContainer>
  );
}
