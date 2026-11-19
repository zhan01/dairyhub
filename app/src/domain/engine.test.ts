import { describe, expect, it } from 'vitest';
import { addDays, at } from '../lib/date';
import { haversine } from '../lib/geo';
import { SCENARIO } from './catalog';
import { bonusTier, checkRecovered, dropRatio, relocationAssessment, runEngine, storePlan, tempOverHours, zeroStreak, aggregatePlan } from './engine';
import { createWorkspace, extendWorkspace } from './seed';

const TODAY = '2026-11-19';
const mk = () => createWorkspace({ company: 'Тест', demo: true, today: TODAY, emailFor: (k) => `${k}@t.kz`, seed: 42 });

describe('primitive rules', () => {
  it('drop ratio compares last 7 days with avg of previous 4 weeks', () => {
    const arr = [...new Array(28).fill(10), ...new Array(7).fill(6)];
    const d = dropRatio(arr, arr.length - 1);
    expect(d.base7).toBe(70);
    expect(d.last7).toBe(42);
    expect(d.change).toBeCloseTo(-0.4);
  });
  it('zero streak counts trailing zero days', () => {
    expect(zeroStreak([5, 3, 0, 0, 0], 4)).toBe(3);
    expect(zeroStreak([5, 3, 0, 1, 0], 4)).toBe(1);
  });
  it('temperature alarm counts trailing hours above limit', () => {
    expect(tempOverHours([-19, -18, -14, -12, -13], -15)).toBe(3);
    expect(tempOverHours([-19, -14, -19], -15)).toBe(0);
  });
  it('bonus tiers at 80 / 100 / 120 %', () => {
    expect(bonusTier(0.79)).toBe(0);
    expect(bonusTier(0.8)).toBe(80);
    expect(bonusTier(1)).toBe(100);
    expect(bonusTier(1.19)).toBe(100);
    expect(bonusTier(1.2)).toBe(120);
  });
  it('haversine ~ 111 km per degree of latitude', () => {
    expect(Math.round(haversine(43, 76, 44, 76) / 1000)).toBe(111);
  });
});

describe('demo scenarios are detected with the right causes and routing', () => {
  const { ws, people } = mk();
  const now = new Date(at(TODAY, 12));
  const res = runEngine(ws, now, TODAY, people);
  const sig = Object.values(ws.signals);
  const byStore = (idx: number) => sig.filter((s) => s.storeId === ws.stores[idx].id);

  it('creates signals', () => expect(res.created.length).toBeGreaterThan(5));

  it('delivery scenario → warehouse task', () => {
    const s = byStore(SCENARIO.delivery).find((x) => x.type === 'sales_drop');
    expect(s).toBeTruthy();
    expect(s!.hypotheses[0].cause).toBe('delivery');
    const tasks = ws.tasks.filter((t) => s!.taskIds.includes(t.id));
    expect(tasks.some((t) => t.dept === 'warehouse')).toBe(true);
  });
  it('debt scenario → accounting task', () => {
    const s = byStore(SCENARIO.debt).find((x) => x.type === 'sales_drop');
    expect(s).toBeTruthy();
    expect(s!.hypotheses[0].cause).toBe('debt');
    expect(ws.tasks.some((t) => s!.taskIds.includes(t.id) && t.dept === 'accounting')).toBe(true);
  });
  it('rep with missed visits → rep-level drop + missed visits signal', () => {
    const repId = ws.stores[SCENARIO.repStart].repId;
    expect(sig.some((s) => s.type === 'rep_drop' && s.repId === repId)).toBe(true);
    expect(sig.some((s) => s.type === 'missed_visit' && s.repId === repId)).toBe(true);
  });
  it('price scenario → manager commercial hypothesis', () => {
    const s = byStore(SCENARIO.price).find((x) => x.type === 'sales_drop');
    expect(s).toBeTruthy();
    expect(s!.hypotheses.some((h) => h.cause === 'price')).toBe(true);
  });
  it('freezer: 3+ days without sales → rep notified and program started', () => {
    const s = byStore(SCENARIO.noSales).find((x) => x.type === 'freezer_no_sales');
    expect(s).toBeTruthy();
    expect(ws.notices.some((n) => n.to.userId === ws.stores[SCENARIO.noSales].repId)).toBe(true);
    const fz = ws.freezers.find((f) => f.id === s!.freezerId)!;
    expect(fz.program?.stage).toBe(1);
  });
  it('freezer missing → high severity signal', () => {
    expect(byStore(SCENARIO.missing).some((x) => x.type === 'freezer_missing' && x.severity === 'high')).toBe(true);
  });
  it('temperature above −15 °C for 2+ h → signal', () => {
    expect(byStore(SCENARIO.temperature).some((x) => x.type === 'temperature')).toBe(true);
  });
  it('unprofitable freezer after 8 weeks → relocation assessment with candidates', () => {
    const s = byStore(SCENARIO.relocation).find((x) => x.type === 'relocation');
    expect(s).toBeTruthy();
    const fz = ws.freezers.find((f) => f.id === s!.freezerId)!;
    const ra = relocationAssessment(ws, fz, TODAY);
    expect(ra.candidates.length).toBe(3);
    expect(ra.candidates[0].score).toBeGreaterThanOrEqual(ra.candidates[1].score);
  });
  it('visit without report → reminder', () => {
    expect(sig.some((s) => s.type === 'report_missing')).toBe(true);
  });
  it('no false-positive drops in healthy stores', () => {
    const healthy = sig.filter((s) => s.type === 'sales_drop' && ![SCENARIO.delivery, SCENARIO.debt, SCENARIO.price].map((i) => ws.stores[i].id).includes(s.storeId!));
    expect(healthy.map((s) => s.title)).toEqual([]);
  });
  it('engine is idempotent', () => {
    const again = runEngine(ws, now, TODAY, people);
    expect(again.created.length).toBe(0);
  });
  it('realistic plan is achievable, top-down plan ~50%', () => {
    const p = aggregatePlan(ws, ws.stores, TODAY);
    expect(p.completion).toBeGreaterThan(0.8);
    expect(p.completionTopDown).toBeLessThan(0.65);
    const sp = storePlan(ws, ws.stores[5], TODAY);
    expect(sp.realistic).toBeGreaterThan(0);
  });
  it('monitoring closes when sales recover', () => {
    const s = byStore(SCENARIO.delivery).find((x) => x.type === 'sales_drop')!;
    const r = checkRecovered(ws, s, TODAY);
    expect(r.recovered).toBe(false);
  });
});

describe('workspace extension', () => {
  it('extends sales and routes when days pass', () => {
    const { ws } = mk();
    const before = ws.sales[ws.stores[0].id].milk25.length;
    extendWorkspace(ws, addDays(TODAY, 3));
    expect(ws.sales[ws.stores[0].id].milk25.length).toBe(before + 3);
  });
});
