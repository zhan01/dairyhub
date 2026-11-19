/**
 * DairyHub analytics & rules engine.
 * Pure detection functions + `runEngine` that turns detections into signals,
 * routed tasks and notifications. The engine proposes *possible* causes with
 * evidence — it never blames; final decisions stay with people.
 */
import { addDays, at, dayDiff, daysInMonth, fmtDayShort, monthStart, weekday } from '../lib/date';
import { money, num, pct, plural } from '../lib/format';
import { uid } from '../lib/rng';
import { CATEGORY_COEF } from './catalog';
import type { Confidence, Dept, Freezer, Hypothesis, Notice, Role, Signal, SignalType, Store, Task, Visit, Workspace } from './types';
import { DEPT_LABEL } from './types';

export const SYSTEM = 'DairyHub';
export const SLA_HOURS: Record<Dept, number> = { warehouse: 24, accounting: 48, manager: 48, rep: 48 };

// ---------------------------------------------------------------- series
export const dayIndex = (ws: Workspace, date: string) => dayDiff(ws.startDate, date);
export const sumRange = (a: number[], from: number, to: number) => {
  let s = 0;
  for (let i = Math.max(0, from); i <= Math.min(a.length - 1, to); i++) s += a[i] || 0;
  return s;
};

export function storeUnits(ws: Workspace, storeId: string, skuIds?: string[]): number[] {
  const bySku = ws.sales[storeId];
  const ids = skuIds ?? Object.keys(bySku);
  const len = bySku[ids[0]]?.length ?? 0;
  const out = new Array(len).fill(0);
  for (const id of ids) bySku[id]?.forEach((v, i) => (out[i] += v));
  return out;
}
export function storeRevenue(ws: Workspace, storeId: string, filter?: (skuId: string) => boolean): number[] {
  const bySku = ws.sales[storeId];
  let out: number[] = [];
  for (const sku of ws.skus) {
    if (filter && !filter(sku.id)) continue;
    const arr = bySku[sku.id];
    if (!out.length) out = new Array(arr.length).fill(0);
    arr.forEach((v, i) => (out[i] += v * sku.price));
  }
  return out;
}
export function revenueSeries(ws: Workspace, storeIds: string[], filter?: (skuId: string) => boolean): number[] {
  let out: number[] = [];
  for (const id of storeIds) {
    const s = storeRevenue(ws, id, filter);
    if (!out.length) out = new Array(s.length).fill(0);
    s.forEach((v, i) => (out[i] += v));
  }
  return out;
}

/** Last 7 complete days (ending at `end`) vs weekly average of the previous 4 weeks. */
export function dropRatio(arr: number[], end: number) {
  const last7 = sumRange(arr, end - 6, end);
  const base7 = sumRange(arr, end - 34, end - 7) / 4;
  const change = base7 > 0 ? last7 / base7 - 1 : 0;
  return { last7, base7, change };
}
export function zeroStreak(arr: number[], end: number): number {
  let n = 0;
  for (let i = end; i >= 0 && (arr[i] ?? 0) === 0; i--) n++;
  return n;
}
/** Trailing hours above limit */
export function tempOverHours(arr: number[], limit: number): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0 && arr[i] > limit; i--) n++;
  return n;
}

// ---------------------------------------------------------------- plans
export function bonusTier(p: number): 0 | 80 | 100 | 120 {
  if (p >= 1.2) return 120;
  if (p >= 1.0) return 100;
  if (p >= 0.8) return 80;
  return 0;
}
export const TIER_LABEL: Record<number, string> = { 0: 'Ниже порога', 80: 'Уровень 1 · 80%', 100: 'Уровень 2 · 100%', 120: 'Уровень 3 · 120%' };

export interface StorePlan {
  avgMonthly: number;
  realistic: number;
  topDown: number;
  fact: number;
  forecast: number;
  elapsed: number;
  days: number;
  excused: number;
}
/** Realistic plan = avg monthly sales (last 84 days) × seasonality × category potential. */
export function storePlan(ws: Workspace, store: Store, todayStr: string): StorePlan {
  const T = dayIndex(ws, todayStr);
  const rev = storeRevenue(ws, store.id);
  const hist = sumRange(rev, T - 84, T - 1);
  const avgMonthly = (hist / 84) * 30;
  const realistic = avgMonthly * ws.settings.seasonality * CATEGORY_COEF[store.category];
  const topDown = avgMonthly * ws.settings.topDownPlanFactor;
  const ms = monthStart(todayStr);
  const msIdx = dayIndex(ws, ms);
  const fact = sumRange(rev, msIdx, T); // includes today's orders
  const elapsed = Math.max(1, T - msIdx); // complete days
  const days = daysInMonth(todayStr);
  const forecast = (sumRange(rev, msIdx, T - 1) / elapsed) * days + rev[T];
  const excused = excusedLoss(ws, store, msIdx, T - 1);
  return { avgMonthly, realistic, topDown, fact, forecast, elapsed, days, excused };
}

/** Estimated revenue lost for reasons outside the rep's control (delivery delays, debt blocks). */
export function excusedLoss(ws: Workspace, store: Store, from: number, to: number): number {
  const bad = ws.deliveries.filter((d) => d.storeId === store.id && ['delayed', 'short', 'blocked'].includes(d.status) && dayIndex(ws, d.plannedDate) >= from - 2 && dayIndex(ws, d.plannedDate) <= to);
  if (!bad.length) return 0;
  const rev = storeRevenue(ws, store.id);
  const T = to + 1;
  const base = sumRange(rev, T - 35, T - 8) / 28;
  let loss = 0;
  const first = Math.max(from, Math.min(...bad.map((d) => dayIndex(ws, d.plannedDate))));
  for (let i = first; i <= to; i++) loss += Math.max(0, base - rev[i]);
  return loss;
}

export function aggregatePlan(ws: Workspace, stores: Store[], todayStr: string) {
  const p = stores.map((s) => storePlan(ws, s, todayStr));
  const sum = (k: keyof StorePlan) => p.reduce((a, b) => a + (b[k] as number), 0);
  const realistic = sum('realistic');
  const forecast = sum('forecast');
  const fact = sum('fact');
  const excused = sum('excused');
  return {
    realistic,
    topDown: sum('topDown'),
    fact,
    forecast,
    excused,
    completion: realistic ? forecast / realistic : 0,
    completionTopDown: sum('topDown') ? forecast / sum('topDown') : 0,
    adjusted: realistic ? (forecast + (excused / Math.max(1, p[0]?.elapsed ?? 1)) * (p[0]?.days ?? 30)) / realistic : 0,
    mtdShare: realistic ? fact / realistic : 0,
    elapsed: p[0]?.elapsed ?? 0,
    days: p[0]?.days ?? 30,
  };
}

// ---------------------------------------------------------------- visits
export function visitStats(visits: Visit[]) {
  const planned = visits.length;
  const done = visits.filter((v) => v.status === 'done').length;
  const missed = visits.filter((v) => v.status === 'missed').length;
  const short = visits.filter((v) => v.flags.includes('Короткий визит')).length;
  const outZone = visits.filter((v) => v.checkIn && !v.checkIn.inZone).length;
  const durs = visits.filter((v) => v.checkIn && v.checkOutAt).map((v) => (v.checkOutAt! - v.checkIn!.t) / 60000);
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  return { planned, done, missed, short, outZone, avgDur, coverage: planned ? done / planned : 1 };
}

export function visitsInRange(ws: Workspace, from: string, to: string, f?: (v: Visit) => boolean) {
  return ws.visits.filter((v) => v.date >= from && v.date <= to && (!f || f(v)));
}

/** Route load: average planned visits per working day and estimated km/day (straight-line × 1.4). */
export function routeLoad(ws: Workspace, repId: string) {
  const stores = ws.stores.filter((s) => s.repId === repId);
  const perWeek = stores.reduce((a, s) => a + s.visitDays.length, 0);
  const workDays = new Set(stores.flatMap((s) => s.visitDays)).size || 1;
  let km = 0;
  for (let wd = 1; wd <= 6; wd++) {
    const r = stores.filter((s) => s.visitDays.includes(wd));
    for (let i = 1; i < r.length; i++) km += geoKm(r[i - 1], r[i]);
  }
  return { stores: stores.length, perDay: perWeek / workDays, kmPerDay: (km * 1.4) / workDays };
}
function geoKm(a: Store, b: Store) {
  const dx = (a.lng - b.lng) * 81.2;
  const dy = (a.lat - b.lat) * 111.2;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------- diagnosis
const conf = (c: Confidence) => c;

export function diagnoseStore(ws: Workspace, store: Store, skuIds: string[], todayStr: string): Hypothesis[] {
  const H: Hypothesis[] = [];
  const from10 = addDays(todayStr, -10);
  const sku = (id: string) => ws.skus.find((s) => s.id === id)!;
  const skuNames = skuIds.map((id) => sku(id).short.toLowerCase());

  // 1. debt block → accounting
  const blocked = ws.deliveries.filter((d) => d.storeId === store.id && d.status === 'blocked' && d.plannedDate >= from10 && d.plannedDate < todayStr);
  if (store.shipmentsBlocked || blocked.length) {
    H.push({
      cause: 'debt',
      title: 'Отгрузки заблокированы из-за просроченной задолженности',
      evidence: [
        `Задолженность ${money(store.debt)} при лимите ${money(store.creditLimit)}, просрочка ${store.debtOverdueDays} ${plural(store.debtOverdueDays, 'день', 'дня', 'дней')}`,
        blocked.length ? `${blocked.length} ${plural(blocked.length, 'поставка заблокирована', 'поставки заблокированы', 'поставок заблокировано')} с ${fmtDayShort(blocked[0].plannedDate)}` : 'Статус клиента в учётной системе: «стоп-отгрузка»',
      ],
      confidence: conf('high'),
      dept: 'accounting',
      action: 'Согласовать с клиентом график погашения и условия разблокировки отгрузок; сообщить руководителю срок',
    });
  }
  // 2. delivery problems → warehouse
  const badDel = ws.deliveries.filter((d) => d.storeId === store.id && (d.status === 'delayed' || d.status === 'short') && d.plannedDate >= from10 && d.plannedDate < todayStr);
  const lastVisit = ws.visits.filter((v) => v.storeId === store.id && v.status === 'done' && v.reportDone).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const oos = lastVisit?.stock ? skuIds.filter((id) => lastVisit.stock![id] === 'out' || lastVisit.stock![id] === 'low') : [];
  if (badDel.length) {
    const ev = badDel.map((d) => `${fmtDayShort(d.plannedDate)}: ${d.status === 'delayed' ? `задержка до ${fmtDayShort(d.actualDate ?? d.plannedDate)}` : `недогруз, выполнено ${pct(d.fillRate)}`}${d.note ? ` — ${d.note}` : ''}`);
    if (oos.length) ev.push(`Представитель зафиксировал дефицит на полке (${fmtDayShort(lastVisit.date)}): ${oos.map((id) => sku(id).short).join(', ')}`);
    H.push({
      cause: 'delivery',
      title: 'Задержки и недогрузы поставок',
      evidence: ev,
      confidence: badDel.length >= 2 || oos.length ? 'high' : 'medium',
      dept: 'warehouse',
      action: 'Выяснить причину задержек, организовать внеочередную поставку недостающих позиций',
    });
  } else if (oos.length && !blocked.length) {
    H.push({
      cause: 'oos',
      title: 'Отсутствие продукции на полке',
      evidence: [`В отчёте визита ${fmtDayShort(lastVisit.date)} отмечен дефицит: ${oos.map((id) => sku(id).short).join(', ')}`, 'Проблем с поставками за 10 дней не обнаружено — возможно, заказ был недостаточным'],
      confidence: 'medium',
      dept: 'rep',
      action: 'Скорректировать заказ по позициям с дефицитом, проверить остатки на складе магазина',
    });
  }
  // 3. visit coverage → manager
  const vis = visitsInRange(ws, addDays(todayStr, -14), addDays(todayStr, -1), (v) => v.storeId === store.id);
  const st = visitStats(vis);
  if (st.planned >= 2 && (st.missed >= 2 || st.missed / st.planned >= 0.3 || st.short >= 2)) {
    const load = routeLoad(ws, store.repId);
    H.push({
      cause: 'visits',
      title: 'Недостаточное покрытие визитами',
      evidence: [
        `За 14 дней: запланировано ${st.planned}, выполнено ${st.done}, пропущено ${st.missed}${st.short ? `, коротких визитов ${st.short}` : ''}`,
        `Нагрузка маршрута: ${load.perDay.toFixed(1).replace('.', ',')} визита в день, ~${Math.round(load.kmPerDay)} км/день — учесть при разборе`,
      ],
      confidence: st.missed / st.planned >= 0.4 ? 'high' : 'medium',
      dept: 'manager',
      action: 'Разобрать причины пропусков с сотрудником (без санкций до выяснения), при необходимости перераспределить маршрут',
    });
  }
  // 4. price / competition → manager
  const comp = lastVisit?.competitor;
  if (store.priceIndex > 1.1 || comp?.active) {
    const ev: string[] = [];
    if (store.priceIndex > 1.1) ev.push(`Индекс цены ${Math.round(store.priceIndex * 100)}% к основному конкуренту (порог 110%)`);
    if (comp?.active) ev.push(`Активность конкурента в отчёте ${fmtDayShort(lastVisit.date)}${comp.note ? `: ${comp.note}` : ''}`);
    H.push({
      cause: 'price',
      title: store.priceIndex > 1.1 ? 'Неконкурентная цена и активность конкурента' : 'Конкурентное давление',
      evidence: ev,
      confidence: store.priceIndex > 1.1 && comp?.active ? 'high' : 'medium',
      dept: 'manager',
      action: 'Принять коммерческое решение: ценовое предложение, промо или POS-материалы для точки',
    });
  }
  // 5. equipment
  const fz = ws.freezers.find((f) => f.storeId === store.id);
  if (fz && (fz.status !== 'installed' || fz.fault) && skuIds.some((id) => sku(id).frozen)) {
    H.push({ cause: 'equipment', title: 'Проблема с оборудованием', evidence: [`Морозильник ${fz.serial}: ${fz.fault ? 'температура вне нормы' : 'статус «' + fz.status + '»'}`], confidence: 'high', dept: 'manager', action: 'Восстановить работу оборудования' });
  }
  if (!H.length) {
    H.push({
      cause: 'unknown',
      title: 'Причина не определена автоматически',
      evidence: ['Поставки, задолженность, визиты и цены в норме', `Затронуты позиции: ${skuNames.join(', ') || 'все'}`],
      confidence: 'low',
      dept: 'manager',
      action: 'Провести совместный визит и диагностику на месте',
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return H.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

export function freezerRevenue(ws: Workspace, storeId: string, todayStr: string, days = 30): number {
  const T = dayIndex(ws, todayStr);
  const rev = storeRevenue(ws, storeId, (id) => ws.skus.find((s) => s.id === id)!.frozen);
  return sumRange(rev, T - days, T - 1);
}

export function diagnoseFreezer(ws: Workspace, fz: Freezer, todayStr: string): Hypothesis[] {
  const store = ws.stores.find((s) => s.id === fz.storeId)!;
  const H: Hypothesis[] = [];
  const lastVisit = ws.visits.filter((v) => v.storeId === store.id && v.status === 'done' && v.reportDone).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const fc = lastVisit?.freezerChecks?.find((c) => c.freezerId === fz.id);
  if (fc && fc.filled !== 'full') H.push({ cause: 'no_product', title: 'Отсутствие продукции', evidence: [`Заполненность морозильника: ${fc.filled === 'empty' ? 'пустой' : 'наполовину'} (${fmtDayShort(lastVisit.date)})`], confidence: fc.filled === 'empty' ? 'high' : 'medium', dept: 'rep', action: 'Срочный заказ мороженого, контроль отгрузки' });
  if (fc && !fc.ownGoodsOnly) H.push({ cause: 'display', title: 'Неправильная выкладка', evidence: ['В морозильнике размещён товар других производителей', lastVisit.comment ?? ''].filter(Boolean), confidence: 'high', dept: 'rep', action: 'Выкладка по планограмме, фото «до/после»' });
  if (store.priceIndex > 1.1) H.push({ cause: 'price', title: 'Неконкурентная цена', evidence: [`Индекс цены ${Math.round(store.priceIndex * 100)}%`], confidence: 'medium', dept: 'manager', action: 'Согласовать цену или промо' });
  if (lastVisit?.competitor?.active) H.push({ cause: 'competition', title: 'Конкурентное давление', evidence: [lastVisit.competitor.note ?? 'Активность конкурента в отчёте'], confidence: 'medium', dept: 'manager', action: 'POS-материалы, промо, перестановка морозильника' });
  const st = visitStats(visitsInRange(ws, addDays(todayStr, -14), addDays(todayStr, -1), (v) => v.storeId === store.id));
  if (st.missed >= 2) H.push({ cause: 'rep_work', title: 'Недостаточная работа представителя', evidence: [`Пропущено ${st.missed} из ${st.planned} визитов за 14 дней`], confidence: 'medium', dept: 'manager', action: 'Разбор с супервайзером, совместный визит' });
  if (store.category === 'C') H.push({ cause: 'low_demand', title: 'Низкий спрос', evidence: ['Точка категории C (низкий трафик)'], confidence: 'low', dept: 'manager', action: 'Корректировка ассортимента' });
  if (!H.length) H.push({ cause: 'unknown', title: 'Требуется диагностика на месте', evidence: ['Данных визитов недостаточно для вывода'], confidence: 'low', dept: 'rep', action: 'Пройти чек-лист из 6 причин при ближайшем визите' });
  return H;
}

// ---------------------------------------------------------------- relocation
export interface RelocationCandidate {
  store: Store;
  score: number;
  potential: number;
  distanceKm: number;
  reason: string;
}
export function relocationAssessment(ws: Workspace, fz: Freezer, todayStr: string) {
  const cur = ws.stores.find((s) => s.id === fz.storeId)!;
  const current = freezerRevenue(ws, cur.id, todayStr);
  const withFreezer = new Set(ws.freezers.filter((f) => f.storeId && f.status !== 'written_off').map((f) => f.storeId));
  const T = dayIndex(ws, todayStr);
  const cands = ws.stores
    .filter((s) => !withFreezer.has(s.id))
    .map((s) => {
      const dairy = sumRange(storeRevenue(ws, s.id), T - 30, T - 1);
      const avgFzShare = 0.19; // typical share of ice cream in stores with a freezer (from current data)
      const potential = dairy * avgFzShare;
      const distanceKm = geoKm(cur, s);
      return { store: s, potential, distanceKm, score: 0, reason: '' };
    });
  const maxP = Math.max(1, ...cands.map((c) => c.potential));
  for (const c of cands) {
    const cat = c.store.category === 'A' ? 1 : c.store.category === 'B' ? 0.7 : 0.3;
    const prox = Math.max(0, 1 - c.distanceKm / 15);
    c.score = Math.round((0.55 * (c.potential / maxP) + 0.3 * cat + 0.15 * prox) * 100);
    c.reason = `Категория ${c.store.category}, оценка потенциала ${money(c.potential)}/мес, ${c.distanceKm.toFixed(1).replace('.', ',')} км`;
  }
  cands.sort((a, b) => b.score - a.score);
  return { current, threshold: ws.settings.freezerMinRevenue, candidates: cands.slice(0, 3) };
}

// ---------------------------------------------------------------- engine
interface Detected {
  id: string;
  type: SignalType;
  severity: Signal['severity'];
  title: string;
  summary: string;
  storeId?: string;
  repId?: string;
  freezerId?: string;
  skuIds?: string[];
  hypotheses: Hypothesis[];
  metrics: Record<string, number>;
  /** who must be notified */
  notify: { userId?: string; role?: Role }[];
  /** tasks to create (routed) */
  tasks?: { dept: Dept; title: string; description: string; assigneeId?: string }[];
}

function isoWeekKey(s: string) {
  const wd = weekday(s);
  return addDays(s, 1 - wd);
}

export function detect(ws: Workspace, now: Date, todayStr: string, people: { id: string; name: string }[] = []): Detected[] {
  const out: Detected[] = [];
  const T = dayIndex(ws, todayStr);
  const Y = T - 1;
  const set = ws.settings;
  const repNames = new Map(people.map((p) => [p.id, p.name]));
  const repName = (id: string) => repNames.get(id) ?? 'Представитель';

  const repIds = [...new Set(ws.stores.map((s) => s.repId))];
  const repWithDrop = new Set<string>();

  // ---- Problem 3: rep-level drop
  for (const repId of repIds) {
    const stores = ws.stores.filter((s) => s.repId === repId);
    const rev = revenueSeries(ws, stores.map((s) => s.id), (id) => !ws.skus.find((k) => k.id === id)!.frozen);
    const d = dropRatio(rev, Y);
    if (d.change <= -set.dropThreshold) {
      repWithDrop.add(repId);
      const affected = stores
        .map((s) => ({ s, d: dropRatio(storeRevenue(ws, s.id), Y) }))
        .filter((x) => x.d.change <= -0.2)
        .sort((a, b) => a.d.change - b.d.change);
      const vis = visitsInRange(ws, addDays(todayStr, -14), addDays(todayStr, -1), (v) => v.repId === repId);
      const vs = visitStats(vis);
      const load = routeLoad(ws, repId);
      const teamLoads = repIds.map((r) => routeLoad(ws, r).perDay);
      const teamAvg = teamLoads.reduce((a, b) => a + b, 0) / teamLoads.length;
      const H: Hypothesis[] = [];
      if (vs.missed >= 2 || vs.short >= 2)
        H.push({ cause: 'visits', title: 'Пропуски и короткие визиты', evidence: [`За 14 дней: ${vs.done} из ${vs.planned} визитов выполнено, пропущено ${vs.missed}, коротких ${vs.short}`, `Средняя длительность визита ${Math.round(vs.avgDur)} мин`], confidence: vs.missed / Math.max(1, vs.planned) >= 0.3 ? 'high' : 'medium', dept: 'manager', action: 'Индивидуальная встреча с сотрудником: выяснить причины (здоровье, транспорт, маршрут), договориться о плане' });
      H.push({ cause: 'route', title: load.perDay > teamAvg * 1.25 ? 'Перегруженный маршрут' : 'Нагрузка маршрута в норме', evidence: [`${load.perDay.toFixed(1).replace('.', ',')} визита/день при среднем по команде ${teamAvg.toFixed(1).replace('.', ',')}`, `~${Math.round(load.kmPerDay)} км/день`], confidence: load.perDay > teamAvg * 1.25 ? 'medium' : 'low', dept: 'manager', action: load.perDay > teamAvg * 1.25 ? 'Перераспределить точки между сотрудниками' : 'Нагрузка не объясняет снижение' });
      const delIssues = ws.deliveries.filter((x) => stores.some((s) => s.id === x.storeId) && ['delayed', 'short', 'blocked'].includes(x.status) && x.plannedDate >= addDays(todayStr, -10) && x.plannedDate < todayStr);
      if (delIssues.length) H.push({ cause: 'delivery', title: 'Проблемы поставок на территории', evidence: [`${delIssues.length} проблемных поставок за 10 дней`], confidence: 'medium', dept: 'warehouse', action: 'Проверить поставки по точкам сотрудника' });
      H.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.confidence] - ({ high: 0, medium: 1, low: 2 })[b.confidence]);
      out.push({
        id: `repdrop:${repId}:${isoWeekKey(todayStr)}`,
        type: 'rep_drop',
        severity: 'high',
        title: `Продажи ${repName(repId)} снизились на ${Math.round(-d.change * 100)}%`,
        summary: `7 дней к среднему за 4 недели: ${money(d.last7)} против ${money(d.base7)}. Затронуто ${affected.length} ${plural(affected.length, 'точка', 'точки', 'точек')}.`,
        repId,
        hypotheses: H,
        metrics: { change: d.change, last7: d.last7, base7: d.base7, missed: vs.missed, planned: vs.planned, affected: affected.length },
        notify: [{ role: 'manager' }],
        tasks: [{ dept: 'manager', title: `Разбор снижения продаж: ${repName(repId)}`, description: 'Провести встречу с сотрудником, выяснить объективные причины, согласовать план восстановления. Оценка — после разбора, а не автоматически.' }],
      });
    }
  }

  // ---- Problem 2/3: store-level and SKU-level drops
  for (const store of ws.stores) {
    if (repWithDrop.has(store.repId)) continue; // folded into rep-level signal
    const nonFrozen = ws.skus.filter((s) => !s.frozen);
    const total = dropRatio(storeUnits(ws, store.id, nonFrozen.map((s) => s.id)), Y);
    let skuIds: string[] = [];
    if (total.change <= -set.dropThreshold) skuIds = nonFrozen.map((s) => s.id);
    else skuIds = nonFrozen.filter((s) => { const d = dropRatio(ws.sales[store.id][s.id], Y); return d.base7 >= 14 && d.change <= -set.dropThreshold; }).map((s) => s.id);
    if (!skuIds.length) continue;
    const whole = skuIds.length === nonFrozen.length;
    const d = whole ? total : dropRatio(storeUnits(ws, store.id, skuIds), Y);
    const rev = whole ? dropRatio(storeRevenue(ws, store.id), Y) : dropRatio(storeRevenue(ws, store.id, (id) => skuIds.includes(id)), Y);
    const H = diagnoseStore(ws, store, skuIds, todayStr);
    const names = skuIds.map((id) => ws.skus.find((s) => s.id === id)!.short);
    const deptTasks = new Map<Dept, Hypothesis>();
    for (const h of H) if (h.confidence !== 'low' && !deptTasks.has(h.dept)) deptTasks.set(h.dept, h);
    if (!deptTasks.size) deptTasks.set(H[0].dept, H[0]);
    out.push({
      id: `drop:${store.id}:${isoWeekKey(todayStr)}`,
      type: 'sales_drop',
      severity: d.change <= -0.5 ? 'high' : 'medium',
      title: `${store.name}: ${whole ? 'продажи' : names.join(', ')} −${Math.round(-d.change * 100)}%`,
      summary: `Последние 7 дней: ${num(d.last7)} шт. против ${num(d.base7)} шт. в среднем за неделю (4 нед.). Потери выручки ~${money(Math.max(0, rev.base7 - rev.last7))} за неделю.`,
      storeId: store.id,
      repId: store.repId,
      skuIds,
      hypotheses: H,
      metrics: { change: d.change, last7: d.last7, base7: d.base7, revLoss: Math.max(0, rev.base7 - rev.last7) },
      notify: [{ role: 'manager' }, { userId: store.repId }, ...[...deptTasks.keys()].filter((k) => k !== 'rep' && k !== 'manager').map((k) => ({ role: k as Role }))],
      tasks: [...deptTasks.entries()].map(([dept, h]) => ({ dept, title: `${h.title} — ${store.name}`, description: `${h.action}.\n\nОснование: ${h.evidence.join('; ')}`, assigneeId: dept === 'rep' ? store.repId : undefined })),
    });
  }

  // ---- Problem 1: missed visits (rolling 7 days, today counts after 19:00)
  const after19 = now.getHours() >= 19;
  for (const repId of repIds) {
    const missed = visitsInRange(ws, addDays(todayStr, -7), todayStr, (v) => v.repId === repId && (v.status === 'missed' || (v.date === todayStr && v.status === 'planned' && after19)));
    if (!missed.length) continue;
    const planned = visitsInRange(ws, addDays(todayStr, -7), todayStr, (v) => v.repId === repId && (v.date < todayStr || after19)).length;
    const load = routeLoad(ws, repId);
    const stores = [...new Set(missed.map((m) => ws.stores.find((s) => s.id === m.storeId)!.name))];
    out.push({
      id: `missed:${repId}:${isoWeekKey(todayStr)}`,
      type: 'missed_visit',
      severity: missed.length >= 3 ? 'high' : 'low',
      title: `${repName(repId)}: ${missed.length} ${plural(missed.length, 'пропущенный визит', 'пропущенных визита', 'пропущенных визитов')} за 7 дней`,
      summary: `Не подтверждены GPS-отметкой: ${stores.slice(0, 4).join(', ')}${stores.length > 4 ? ` и ещё ${stores.length - 4}` : ''}. Выполнение графика ${pct(1 - missed.length / Math.max(1, planned))}.`,
      repId,
      hypotheses: [
        { cause: 'route', title: 'Нагрузка маршрута', evidence: [`${load.stores} точек, ${load.perDay.toFixed(1).replace('.', ',')} визита/день, ~${Math.round(load.kmPerDay)} км/день`], confidence: 'low', dept: 'manager', action: 'Проверить реалистичность маршрута' },
        { cause: 'discipline', title: 'Требуется уточнение у сотрудника', evidence: [`Пропущено ${missed.length} из ${planned} визитов`], confidence: missed.length >= 3 ? 'medium' : 'low', dept: 'manager', action: 'Уточнить причины, при необходимости перенести визиты' },
      ],
      metrics: { missed: missed.length, planned },
      notify: [{ userId: repId }, ...(missed.length >= 3 ? [{ role: 'manager' as Role }] : [])],
      tasks: missed.length >= 3 ? [{ dept: 'manager', title: `Пропуски визитов: ${repName(repId)}`, description: `Пропущено ${missed.length} визитов за 7 дней. Уточнить причины и согласовать восстановление графика.` }] : undefined,
    });
  }

  // ---- report reminders (>30 min after check-out)
  for (const v of ws.visits) {
    if (v.status !== 'done' || v.reportDone || !v.checkOutAt) continue;
    if (now.getTime() - v.checkOutAt < 30 * 60000) continue;
    const st = ws.stores.find((s) => s.id === v.storeId)!;
    out.push({ id: `report:${v.id}`, type: 'report_missing', severity: 'low', title: `Не заполнен отчёт: ${st.name}`, summary: `Визит ${fmtDayShort(v.date)} завершён без отчёта о наличии, оборудовании и заказе.`, storeId: st.id, repId: v.repId, hypotheses: [], metrics: {}, notify: [{ userId: v.repId }] });
  }

  // ---- Problems 4 & 5: freezers
  for (const fz of ws.freezers) {
    if (!fz.storeId) continue;
    const store = ws.stores.find((s) => s.id === fz.storeId)!;
    if (fz.status === 'missing') {
      out.push({
        id: `missing:${fz.id}`,
        type: 'freezer_missing',
        severity: 'high',
        title: `Морозильник ${fz.serial} не обнаружен — ${store.name}`,
        summary: `Последнее подтверждение ${fz.lastVerifiedAt ? fmtDayShort(fz.lastVerifiedAt) : '—'}. Отметка представителя с GPS и фото.`,
        storeId: store.id,
        repId: store.repId,
        freezerId: fz.id,
        hypotheses: [{ cause: 'missing', title: 'Оборудование вывезено или перемещено без согласования', evidence: (ws.visits.filter((v) => v.storeId === store.id && v.flags.includes('Оборудование отсутствует')).map((v) => `${fmtDayShort(v.date)}: ${v.comment ?? 'отмечено отсутствие'}`)).slice(0, 2), confidence: 'high', dept: 'manager', action: 'Связаться с владельцем точки, составить акт, при необходимости вернуть или заменить оборудование' }],
        metrics: {},
        notify: [{ role: 'manager' }, { role: 'warehouse' }],
        tasks: [{ dept: 'manager', title: `Найти морозильник ${fz.serial}`, description: `Связаться с ${store.contact}, выяснить местонахождение оборудования, составить акт. Склад: проверить, не поступал ли морозильник на ремонт.` }],
      });
      continue;
    }
    if (fz.hasSensor && ws.temps[fz.id]) {
      const over = tempOverHours(ws.temps[fz.id], set.tempLimit);
      if (over >= set.tempHours) {
        const cur = ws.temps[fz.id][ws.temps[fz.id].length - 1];
        out.push({
          id: `temp:${fz.id}:${todayStr}`,
          type: 'temperature',
          severity: 'high',
          title: `Температура ${cur.toFixed(1).replace('.', ',').replace('-', '−')} °C — ${store.name}`,
          summary: `Датчик фиксирует выше ${set.tempLimit} °C уже ${over} ч (норма ≤ −18 °C). Риск порчи продукции.`,
          storeId: store.id,
          repId: store.repId,
          freezerId: fz.id,
          hypotheses: [{ cause: 'cooling', title: 'Неисправность охлаждения или открытая крышка', evidence: [`${over} ч подряд выше ${set.tempLimit} °C`, `Модель ${fz.model}, установлен ${fmtDayShort(fz.installedAt)}`], confidence: 'high', dept: 'manager', action: 'Вызвать сервис, представителю — проверить крышку и розетку, при необходимости вывезти товар' }],
          metrics: { temp: cur, hours: over },
          notify: [{ role: 'manager' }, { userId: store.repId }],
          tasks: [{ dept: 'manager', title: `Сервис морозильника ${fz.serial}`, description: 'Организовать выезд сервисной службы. Проверить сохранность продукции.' }, { dept: 'rep', title: `Проверить морозильник ${fz.serial}`, description: 'Проверить, закрыта ли крышка и подключено ли питание, сделать фото.', assigneeId: store.repId }],
        });
      }
    }
    const frozenRev = storeRevenue(ws, store.id, (id) => ws.skus.find((s) => s.id === id)!.frozen);
    const streak = zeroStreak(frozenRev, Y);
    if (streak >= set.zeroSalesDays) {
      const H = diagnoseFreezer(ws, fz, todayStr);
      out.push({
        id: `nosales:${fz.id}:${addDays(todayStr, -streak)}`,
        type: 'freezer_no_sales',
        severity: 'medium',
        title: `Нет продаж мороженого ${streak} ${plural(streak, 'день', 'дня', 'дней')} — ${store.name}`,
        summary: `Морозильник ${fz.serial} установлен, но продаж нет с ${fmtDayShort(addDays(todayStr, -streak))}. Запущен этап 1 — диагностика.`,
        storeId: store.id,
        repId: store.repId,
        freezerId: fz.id,
        hypotheses: H,
        metrics: { streak },
        notify: [{ userId: store.repId }, { role: 'manager' }],
        tasks: [{ dept: 'rep', title: `Диагностика морозильника — ${store.name}`, description: 'Пройти чек-лист из 6 причин при ближайшем визите и сделать фото.', assigneeId: store.repId }],
      });
    }
    if (fz.program && dayDiff(fz.program.startedAt, todayStr) >= 56) {
      const rev30 = freezerRevenue(ws, store.id, todayStr);
      if (rev30 < set.freezerMinRevenue) {
        const ra = relocationAssessment(ws, fz, todayStr);
        out.push({
          id: `reloc:${fz.id}`,
          type: 'relocation',
          severity: 'medium',
          title: `Оценить перенос морозильника — ${store.name}`,
          summary: `${Math.floor(dayDiff(fz.program.startedAt, todayStr) / 7)} недель программы, выручка мороженого ${money(rev30)} за 30 дней при минимуме ${money(set.freezerMinRevenue)}. Лучший кандидат: ${ra.candidates[0]?.store.name ?? '—'}.`,
          storeId: store.id,
          repId: store.repId,
          freezerId: fz.id,
          hypotheses: [{ cause: 'unprofitable', title: 'Точка остаётся нерентабельной после 4 этапов', evidence: [`Выручка 30 дней: ${money(rev30)}`, ...fz.program.actions.slice(-2).map((a) => a.text)], confidence: 'medium', dept: 'manager', action: 'Принять решение: продолжить программу или перенести морозильник в точку с бо́льшим потенциалом' }],
          metrics: { rev30, threshold: set.freezerMinRevenue },
          notify: [{ role: 'manager' }],
        });
      }
    }
  }

  // ---- Problem 2: plan risk per rep (realistic plan)
  for (const repId of repIds) {
    const stores = ws.stores.filter((s) => s.repId === repId);
    const p = aggregatePlan(ws, stores, todayStr);
    if (p.elapsed >= 5 && p.completion < 0.8) {
      const causes: Hypothesis[] = [];
      const lossBy = lossBreakdown(ws, stores, todayStr);
      for (const [k, v] of Object.entries(lossBy)) if (v > 0) causes.push({ cause: k, title: LOSS_LABEL[k], evidence: [`Оценка упущенной выручки с начала месяца: ${money(v)}`], confidence: v > p.realistic * 0.05 ? 'high' : 'medium', dept: LOSS_DEPT[k], action: LOSS_ACTION[k] });
      out.push({
        id: `plan:${repId}:${monthStart(todayStr)}`,
        type: 'plan_risk',
        severity: 'medium',
        title: `Прогноз выполнения плана ${repName(repId)}: ${pct(p.completion)}`,
        summary: `Реалистичный план ${money(p.realistic)}, прогноз ${money(p.forecast)}. Скорректированное выполнение с учётом внешних причин — ${pct(p.adjusted)}.`,
        repId,
        hypotheses: causes.length ? causes : [{ cause: 'unknown', title: 'Требуется анализ', evidence: ['Явных причин не обнаружено'], confidence: 'low', dept: 'manager', action: 'Разобрать с сотрудником' }],
        metrics: { completion: p.completion, adjusted: p.adjusted },
        notify: [{ role: 'manager' }, { userId: repId }],
      });
    }
  }
  return out;
}

export const LOSS_LABEL: Record<string, string> = { delivery: 'Задержки и недогрузы поставок', debt: 'Блокировка отгрузок из-за долга', visits: 'Пропущенные визиты', oos: 'Дефицит на полке', price: 'Цена и конкуренты', other: 'Прочие / не определено' };
const LOSS_DEPT: Record<string, Dept> = { delivery: 'warehouse', debt: 'accounting', visits: 'manager', oos: 'rep', price: 'manager', other: 'manager' };
const LOSS_ACTION: Record<string, string> = { delivery: 'Склад: устранить задержки', debt: 'Бухгалтерия: урегулировать задолженность', visits: 'Руководитель: восстановить график визитов', oos: 'Представитель: скорректировать заказы', price: 'Руководитель: коммерческое решение', other: 'Разобрать индивидуально' };

/** Attribute estimated lost revenue (vs baseline) month-to-date to the most likely cause per store. */
export function lossBreakdown(ws: Workspace, stores: Store[], todayStr: string): Record<string, number> {
  const out: Record<string, number> = { delivery: 0, debt: 0, visits: 0, oos: 0, price: 0, other: 0 };
  const T = dayIndex(ws, todayStr);
  const ms = dayIndex(ws, monthStart(todayStr));
  for (const s of stores) {
    const rev = storeRevenue(ws, s.id);
    const base = sumRange(rev, T - 42, T - 15) / 28;
    let loss = 0;
    for (let i = ms; i < T; i++) loss += Math.max(0, base * 0.97 - rev[i]);
    if (loss < base * 0.6) continue;
    const H = diagnoseStore(ws, s, ws.skus.filter((k) => !k.frozen).map((k) => k.id), todayStr);
    const top = H[0]?.cause ?? 'other';
    const key = top in out ? top : top === 'unknown' ? 'other' : 'other';
    out[key] += loss;
  }
  return out;
}

// ---------------------------------------------------------------- run
export interface EngineResult {
  created: Signal[];
  changed: boolean;
}

export function dueFor(ws: Workspace, dept: Dept, storeId: string | undefined, now: number, todayStr: string): number {
  if (dept === 'rep' && storeId) {
    const st = ws.stores.find((s) => s.id === storeId)!;
    for (let d = 0; d <= 7; d++) {
      const date = addDays(todayStr, d);
      if (st.visitDays.includes(weekday(date)) && (d > 0 || new Date(now).getHours() < 17)) return at(date, 19);
    }
  }
  return now + SLA_HOURS[dept] * 3600000;
}

export function runEngine(ws: Workspace, now: Date, todayStr: string, people: { id: string; name: string }[]): EngineResult {
  const detected = detect(ws, now, todayStr, people);
  const created: Signal[] = [];
  const nowT = now.getTime();
  const ids = new Set(detected.map((d) => d.id));
  let changed = false;

  for (const d of detected) {
    const existing = ws.signals[d.id];
    if (existing) {
      if (existing.status === 'resolved' || existing.status === 'dismissed') continue;
      existing.metrics = d.metrics;
      existing.title = d.title;
      existing.summary = d.summary;
      if (existing.status === 'new') existing.hypotheses = d.hypotheses;
      continue;
    }
    const sig: Signal = {
      id: d.id,
      type: d.type,
      severity: d.severity,
      title: d.title,
      summary: d.summary,
      storeId: d.storeId,
      repId: d.repId,
      freezerId: d.freezerId,
      skuIds: d.skuIds,
      detectedAt: nowT,
      status: 'new',
      hypotheses: d.hypotheses,
      metrics: d.metrics,
      history: [{ t: nowT, text: 'Отклонение обнаружено. Проанализированы визиты, остатки, поставки, задолженность и цены.', by: SYSTEM }],
      taskIds: [],
    };
    for (const t of d.tasks ?? []) {
      const task: Task = {
        id: uid('t_'),
        signalId: sig.id,
        title: t.title,
        description: t.description,
        dept: t.dept,
        assigneeId: t.assigneeId,
        storeId: d.storeId,
        status: 'open',
        createdAt: nowT,
        dueAt: dueFor(ws, t.dept, d.storeId, nowT, todayStr),
        createdBy: SYSTEM,
        comments: [],
      };
      ws.tasks.push(task);
      sig.taskIds.push(task.id);
      sig.history.push({ t: nowT, text: `Задача направлена: ${DEPT_LABEL[t.dept]} — «${t.title}»`, by: SYSTEM });
    }
    if (sig.taskIds.length) sig.status = 'in_progress';
    if (d.type === 'freezer_no_sales' && d.freezerId) {
      const fz = ws.freezers.find((f) => f.id === d.freezerId)!;
      if (!fz.program || fz.program.stage === 4) {
        if (!fz.program) fz.program = { stage: 1, startedAt: todayStr, checklist: {}, actions: [{ t: nowT, text: 'Программа запущена автоматически: 3+ дня без продаж', by: SYSTEM }] };
      }
    }
    for (const n of d.notify) pushNotice(ws, { to: n, title: d.title, body: d.summary, kind: 'signal', link: `/signals/${encodeURIComponent(sig.id)}` }, nowT);
    ws.signals[sig.id] = sig;
    created.push(sig);
    changed = true;
  }

  // lifecycle: auto-close conditions that cleared, monitoring → result check
  for (const sig of Object.values(ws.signals)) {
    if (sig.status === 'resolved' || sig.status === 'dismissed') continue;
    if ((sig.type === 'report_missing' || sig.type === 'temperature' || sig.type === 'freezer_missing') && !ids.has(sig.id)) {
      sig.status = 'resolved';
      sig.history.push({ t: nowT, text: 'Условие устранено — сигнал закрыт автоматически', by: SYSTEM });
      changed = true;
      continue;
    }
    if (sig.status === 'monitoring' && sig.monitorUntil && todayStr >= sig.monitorUntil) {
      const ok = checkRecovered(ws, sig, todayStr);
      sig.status = ok.recovered ? 'resolved' : 'in_progress';
      sig.history.push({ t: nowT, text: ok.text, by: SYSTEM });
      changed = true;
    }
  }
  return { created, changed };
}

export function checkRecovered(ws: Workspace, sig: Signal, todayStr: string): { recovered: boolean; text: string; ratio: number } {
  const Y = dayIndex(ws, todayStr) - 1;
  let arr: number[] | null = null;
  if (sig.type === 'sales_drop' && sig.storeId) arr = storeUnits(ws, sig.storeId, sig.skuIds);
  else if (sig.type === 'rep_drop' && sig.repId) arr = revenueSeries(ws, ws.stores.filter((s) => s.repId === sig.repId).map((s) => s.id));
  else if ((sig.type === 'freezer_no_sales' || sig.type === 'relocation') && sig.storeId) arr = storeRevenue(ws, sig.storeId, (id) => ws.skus.find((s) => s.id === id)!.frozen);
  if (!arr) return { recovered: true, text: 'Контроль завершён', ratio: 1 };
  const last7 = sumRange(arr, Y - 6, Y);
  const base = sig.metrics.base7 || sumRange(arr, Y - 34, Y - 7) / 4;
  const ratio = base ? last7 / base : 1;
  return ratio >= 0.9
    ? { recovered: true, text: `Контроль результата: продажи восстановились до ${pct(ratio)} от базового уровня. Сигнал закрыт.`, ratio }
    : { recovered: false, text: `Контроль результата: продажи на уровне ${pct(ratio)} от базового. Требуется повторный анализ.`, ratio };
}

export function pushNotice(ws: Workspace, n: Omit<Notice, 'id' | 't' | 'readBy'>, t = Date.now()) {
  ws.notices.unshift({ id: uid('n_'), t, readBy: [], ...n });
  if (ws.notices.length > 400) ws.notices.length = 400;
}
