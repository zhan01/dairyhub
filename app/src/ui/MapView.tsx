import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
  popup?: string;
}

export interface MapLine {
  points: [number, number][];
  color: string;
  dashed?: boolean;
}

export function MapView({ points, height, className = '', onSelect, radius, lines }: { points: MapPoint[]; height?: number; className?: string; onSelect?: (id: string) => void; radius?: { lat: number; lng: number; m: number }; lines?: MapLine[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const sel = useRef(onSelect);
  sel.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of points) {
      const icon = L.divIcon({ className: '', html: `<div class="pin" style="background:${p.color}">${p.label ?? ''}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      const mk = L.marker([p.lat, p.lng], { icon }).addTo(g);
      if (p.popup) mk.bindPopup(p.popup);
      mk.on('click', () => sel.current?.(p.id));
    }
    if (radius) L.circle([radius.lat, radius.lng], { radius: radius.m, color: '#0a84ff', weight: 1.5, fillOpacity: 0.08 }).addTo(g);
    for (const ln of lines ?? []) if (ln.points.length > 1) L.polyline(ln.points, { color: ln.color, weight: 4, opacity: 0.9, dashArray: ln.dashed ? '6 8' : undefined, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    const all: [number, number][] = [...points.map((p) => [p.lat, p.lng] as [number, number]), ...(lines ?? []).flatMap((l) => l.points)];
    if (all.length === 1) m.setView(all[0], 15);
    else if (all.length) m.fitBounds(L.latLngBounds(all).pad(0.12));
    setTimeout(() => m.invalidateSize(), 50);
  }, [points, radius, lines]);

  return <div ref={el} className={`map ${className}`} style={height ? { height } : undefined} />;
}
