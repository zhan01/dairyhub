import { describe, expect, it } from 'vitest';
import { at } from '../lib/date';
import { findStops, trackDistanceKm, type TrackPoint } from './track';
import { createWorkspace } from './seed';
import { reminders, storePlan, runEngine } from './engine';

const TODAY = '2026-11-19';
const mk = () => createWorkspace({ company: 'Т', demo: true, today: TODAY, emailFor: (k) => `${k}@t.kz`, seed: 7 });

describe('GPS track', () => {
  it('distance ignores jitter and impossible jumps', () => {
    const t0 = at(TODAY, 9);
    const pts: TrackPoint[] = [
      [43.2, 76.9, t0, 10],
      [43.20005, 76.9, t0 + 60000, 10], // 5.5 m jitter — ignored
      [43.209, 76.9, t0 + 600000, 10], // ~1 km
      [44.5, 76.9, t0 + 660000, 10], // 140 km in a minute — ignored
    ];
    expect(trackDistanceKm(pts)).toBeCloseTo(1.0, 1);
  });
  it('detects stops of 8+ minutes', () => {
    const t0 = at(TODAY, 10);
    const pts: TrackPoint[] = Array.from({ length: 6 }, (_, i) => [43.2 + i * 0.00001, 76.9, t0 + i * 120000, 10] as TrackPoint);
    pts.push([43.25, 76.95, t0 + 13 * 60000, 10]);
    const st = findStops(pts);
    expect(st.length).toBe(1);
    expect(Math.round(st[0].minutes)).toBe(10);
  });
  it('seed builds shift tracks; today shift is open and simulated', () => {
    const { ws } = mk();
    expect(ws.shifts.length).toBeGreaterThan(20);
    const today = ws.shifts.filter((s) => s.date === TODAY);
    expect(today.every((s) => !s.endAt && s.simulated)).toBe(true);
    const past = ws.shifts.find((s) => s.date !== TODAY)!;
    expect(past.endAt).toBeGreaterThan(past.startAt);
    expect(trackDistanceKm(past.points)).toBeGreaterThan(1);
  });
});

describe('reminders & plans', () => {
  it('18:00 summary sent once per rep, overdue tasks notified once', () => {
    const { ws, people } = mk();
    runEngine(ws, new Date(at(TODAY, 12)), TODAY, people);
    const t = ws.tasks[0];
    t.dueAt = at(TODAY, 13);
    const n0 = ws.notices.length;
    expect(reminders(ws, new Date(at(TODAY, 18, 30)), TODAY, people)).toBe(true);
    const n1 = ws.notices.length;
    expect(n1).toBeGreaterThan(n0);
    expect(ws.notices.some((n) => n.title === 'Итоги дня')).toBe(true);
    expect(ws.notices.some((n) => n.title === 'Задача просрочена')).toBe(true);
    reminders(ws, new Date(at(TODAY, 18, 45)), TODAY, people);
    expect(ws.notices.length).toBe(n1);
  });
  it('manager override replaces the realistic plan', () => {
    const { ws } = mk();
    const st = ws.stores[3];
    ws.planOverrides[st.id] = { value: 1234567, comment: 'тест', by: 'Руководитель', t: 0 };
    const p = storePlan(ws, st, TODAY);
    expect(p.realistic).toBe(1234567);
    expect(p.overridden).toBe(true);
  });
});
