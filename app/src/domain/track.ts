/**
 * GPS shift tracking: distance, stops and demo track generation.
 * Points are collected only during a working shift (consent + NFR-13).
 */
import { haversine } from '../lib/geo';
import { uid } from '../lib/rng';
import type { Shift, Store, Visit } from './types';

export type TrackPoint = Shift['points'][number];

export function trackDistanceKm(points: TrackPoint[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    // ignore GPS jitter below 15 m and impossible jumps (> 150 km/h)
    const dt = (points[i][2] - points[i - 1][2]) / 3600000;
    if (d < 15) continue;
    if (dt > 0 && d / 1000 / dt > 150) continue;
    m += d;
  }
  return m / 1000;
}

export interface Stop {
  lat: number;
  lng: number;
  from: number;
  to: number;
  minutes: number;
}

/** Stops = clusters of consecutive points within `radius` metres lasting at least `minMinutes`. */
export function findStops(points: TrackPoint[], radius = 70, minMinutes = 8): Stop[] {
  const out: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    let j = i + 1;
    while (j < points.length && haversine(points[i][0], points[i][1], points[j][0], points[j][1]) <= radius) j++;
    const from = points[i][2];
    const to = points[j - 1][2];
    const minutes = (to - from) / 60000;
    if (minutes >= minMinutes) {
      const seg = points.slice(i, j);
      out.push({ lat: seg.reduce((a, p) => a + p[0], 0) / seg.length, lng: seg.reduce((a, p) => a + p[1], 0) / seg.length, from, to, minutes });
      i = j;
    } else i++;
  }
  return out;
}

export function shiftSummary(sh: Shift, now = Date.now()) {
  const end = sh.endAt ?? (sh.points.length ? Math.max(now, sh.points[sh.points.length - 1][2]) : now);
  return {
    km: trackDistanceKm(sh.points),
    hours: Math.max(0, (end - sh.startAt) / 3600000),
    stops: findStops(sh.points),
    last: sh.points[sh.points.length - 1],
  };
}

/** Synthetic but realistic track: home → each completed visit (dwell) → home. */
export function demoShift(repId: string, date: string, home: [number, number], visits: Visit[], stores: Store[], rnd: () => number, open: boolean): Shift | null {
  const done = visits.filter((v) => v.checkIn && v.status !== 'missed').sort((a, b) => a.checkIn!.t - b.checkIn!.t);
  if (!done.length) return null;
  const pts: TrackPoint[] = [];
  const jitter = () => (rnd() - 0.5) * 0.0004;
  const move = (a: [number, number], b: [number, number], t0: number, t1: number) => {
    const steps = Math.max(2, Math.round((t1 - t0) / 120000));
    // slight curve so the line looks like streets, not a ruler
    const bend = (rnd() - 0.5) * 0.004;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const curve = Math.sin(f * Math.PI) * bend;
      pts.push([a[0] + (b[0] - a[0]) * f + curve + jitter() * 0.3, a[1] + (b[1] - a[1]) * f - curve + jitter() * 0.3, Math.round(t0 + (t1 - t0) * f), Math.round(8 + rnd() * 20)]);
    }
  };
  const start = done[0].checkIn!.t - 25 * 60000;
  pts.push([home[0], home[1], start, 15]);
  let cur: [number, number] = home;
  let t = start;
  for (const v of done) {
    const st = stores.find((s) => s.id === v.storeId)!;
    const target: [number, number] = [v.checkIn!.lat, v.checkIn!.lng];
    move(cur, target, t, v.checkIn!.t);
    const out = v.checkOutAt ?? v.checkIn!.t + 15 * 60000;
    for (let tt = v.checkIn!.t + 180000; tt < out; tt += 180000) pts.push([st.lat + jitter() * 0.25, st.lng + jitter() * 0.25, tt, Math.round(6 + rnd() * 15)]);
    cur = target;
    t = out;
  }
  let endAt: number | undefined;
  if (!open) {
    endAt = t + 22 * 60000;
    move(cur, home, t, endAt);
  }
  return { id: uid('sh_'), repId, date, startAt: start, endAt, points: pts };
}
