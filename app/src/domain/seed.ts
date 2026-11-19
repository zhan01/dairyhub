import { addDays, at, dayDiff, weekday } from '../lib/date';
import { hashStr, rng, uid } from '../lib/rng';
import { haversine } from '../lib/geo';
import { CATEGORY_COEF, DISTRICT_CENTERS, REP_PEOPLE, SCENARIO, SKUS, STAFF_PEOPLE, WEEKDAY_FACTOR, storeIdentity } from './catalog';
import type { Delivery, Freezer, Role, Sku, Store, Visit, Workspace } from './types';
import { DEFAULT_SETTINGS } from './types';

export const HISTORY_DAYS = 84;

export interface SeedPerson {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string;
}

export interface SeedOptions {
  company: string;
  demo: boolean;
  today: string;
  /** builds a login e-mail for a seeded employee by key (manager, rep, rep2 …) */
  emailFor: (key: string) => string;
  admin?: { name: string; email: string };
  seed?: number;
}

/** Deterministic daily demand for one store × SKU on day index i (0 = startDate). */
export function baseUnits(seed: number, store: Store, sku: Sku, i: number, date: string): number {
  const r = rng(hashStr(`${seed}|${store.id}|${sku.id}|${i}`));
  const trend = 1 + 0.05 * (i / HISTORY_DAYS);
  const noise = r.range(0.85, 1.15);
  const v = store.volume * sku.popularity * WEEKDAY_FACTOR[weekday(date)] * trend * noise;
  return Math.max(0, Math.round(v));
}

function scenarioFactor(storeIdx: number, sku: Sku, i: number, T: number): number {
  const lastN = (n: number) => i >= T - n && i < T;
  if (storeIdx === SCENARIO.delivery && (sku.id === 'kefir' || sku.id === 'milk25') && lastN(6)) return 0.45;
  if (storeIdx === SCENARIO.debt && lastN(9)) return 0.22;
  if (storeIdx >= SCENARIO.repStart && storeIdx < SCENARIO.repStart + 10 && lastN(9)) return 0.6;
  if (storeIdx === SCENARIO.price && (sku.id === 'yogurt' || sku.id === 'ayran') && lastN(8)) return 0.55;
  if (storeIdx === SCENARIO.noSales && sku.frozen && lastN(4)) return 0;
  if (storeIdx === SCENARIO.missing && sku.frozen && lastN(2)) return 0;
  if (storeIdx === SCENARIO.relocation && sku.frozen) return 0.22;
  return 1;
}

export function createWorkspace(opts: SeedOptions): { ws: Workspace; people: SeedPerson[] } {
  const seed = opts.seed ?? hashStr(opts.company + opts.today + Math.random());
  const r = rng(seed);
  const wsId = uid('ws_');
  const T = HISTORY_DAYS; // index of "today"
  const startDate = addDays(opts.today, -T);

  const people: SeedPerson[] = [];
  const phone = () => `+7 7${r.int(0, 9)}${r.int(0, 9)} ${r.int(100, 999)} ${r.int(10, 99)} ${r.int(10, 99)}`;
  if (opts.admin) people.push({ id: uid('u_'), name: opts.admin.name, email: opts.admin.email, role: 'admin', phone: phone() });
  for (const s of STAFF_PEOPLE) people.push({ id: uid('u_'), name: s.name, email: opts.emailFor(s.key), role: s.role, phone: phone() });
  const reps = REP_PEOPLE.map((p) => ({ id: uid('u_'), name: p.name, email: opts.emailFor(p.key), role: 'rep' as Role, phone: phone() }));
  people.push(...reps);

  // ---------- stores ----------
  const stores: Store[] = [];
  for (let ri = 0; ri < reps.length; ri++) {
    const [clat, clng] = DISTRICT_CENTERS[ri];
    for (let k = 0; k < 10; k++) {
      const idx = ri * 10 + k;
      const id = `st_${idx + 1}`;
      const ident = storeIdentity(idx, r.pick);
      const volume = ident.category === 'A' ? r.range(1.6, 2.2) : ident.category === 'B' ? r.range(0.95, 1.3) : r.range(0.6, 0.8);
      const visitDays = ident.category === 'A' ? [1, 3, 5] : ident.category === 'B' ? (k % 2 ? [2, 4] : [1, 4]) : [[2], [3], [5]][k % 3];
      const creditLimit = Math.round((volume * 900000) / 50000) * 50000;
      stores.push({
        id,
        name: ident.name,
        channel: ident.channel,
        address: `г. Алматы, ${ident.street}`,
        lat: clat + r.range(-0.012, 0.012),
        lng: clng + r.range(-0.016, 0.016),
        category: ident.category,
        repId: reps[ri].id,
        visitDays,
        volume,
        debt: Math.round((creditLimit * r.range(0.05, 0.5)) / 1000) * 1000,
        debtOverdueDays: r.chance(0.12) ? r.int(3, 9) : 0,
        creditLimit,
        shipmentsBlocked: false,
        priceIndex: Math.round(r.range(0.94, 1.06) * 100) / 100,
        contact: `${r.pick(['Сауле', 'Нурлан', 'Ирина', 'Бауыржан', 'Алия', 'Сергей', 'Жанар', 'Канат'])}, ${r.pick(['управляющий', 'товаровед', 'владелец'])}`,
      });
    }
  }
  const S = (idx: number) => stores[idx];
  // scenario adjustments
  S(SCENARIO.debt).debt = Math.round(S(SCENARIO.debt).creditLimit * 1.35);
  S(SCENARIO.debt).debtOverdueDays = 38;
  S(SCENARIO.debt).shipmentsBlocked = true;
  S(SCENARIO.price).priceIndex = 1.18;
  S(SCENARIO.delivery).debtOverdueDays = 0;

  // ---------- freezers ----------
  const freezers: Freezer[] = [];
  let fn = 101;
  const models = ['Frost AX-400', 'Frost AX-500', 'IceLine 350', 'IceLine 450 Glass'];
  const sensorStores = new Set([SCENARIO.temperature, 0, 12, 24, 33, 41, 52, 6]);
  stores.forEach((st, idx) => {
    const has = st.category !== 'C' || idx === SCENARIO.relocation || idx % 4 === 0;
    if (!has) return;
    const installedAt = addDays(opts.today, -r.int(120, 700));
    const f: Freezer = {
      id: `fz_${fn}`,
      serial: `DH-${String(fn).padStart(4, '0')}-${r.int(10, 99)}`,
      model: r.pick(models),
      storeId: st.id,
      status: 'installed',
      hasSensor: sensorStores.has(idx),
      installedAt,
      lastVerifiedAt: addDays(opts.today, -r.int(1, 6)),
      history: [{ t: at(installedAt, 11), text: `Установлен в ${st.name}` }],
    };
    if (idx === SCENARIO.relocation) {
      const ps = addDays(opts.today, -63);
      f.program = {
        stage: 4,
        startedAt: ps,
        checklist: { no_product: false, display: true, low_demand: true, price: false, rep_work: false, competition: true },
        actions: [
          { t: at(ps, 15), text: 'Диагностика: выявлены низкий спрос, слабая выкладка и конкурентное давление', by: 'Мадина Ахметова' },
          { t: at(addDays(ps, 6), 12), text: 'Выкладка по планограмме, установлены ценники и шелфтокеры', by: 'Мадина Ахметова' },
          { t: at(addDays(ps, 20), 12), text: 'Промо «2 по цене 1,5» на эскимо (бюджет POS-материалов)', by: 'Арман Касымов' },
          { t: at(addDays(ps, 35), 10), text: 'Переход к этапу постоянного контроля', by: 'Арман Касымов' },
        ],
      };
    }
    freezers.push(f);
    fn++;
  });
  for (let i = 0; i < 4; i++) {
    freezers.push({ id: `fz_${fn}`, serial: `DH-${String(fn).padStart(4, '0')}-${r.int(10, 99)}`, model: r.pick(models), storeId: null, status: 'warehouse', hasSensor: i < 2, installedAt: addDays(opts.today, -r.int(30, 300)), history: [{ t: at(addDays(opts.today, -20), 10), text: 'Поступил на склад после обслуживания' }] });
    fn++;
  }
  const fzByStore = (idx: number) => freezers.find((f) => f.storeId === stores[idx].id)!;

  // ---------- sales ----------
  const sales: Workspace['sales'] = {};
  const hasFreezer = new Set(freezers.filter((f) => f.storeId).map((f) => f.storeId!));
  stores.forEach((st, idx) => {
    sales[st.id] = {};
    for (const sku of SKUS) {
      const arr: number[] = [];
      for (let i = 0; i <= T; i++) {
        if (i === T) { arr.push(0); continue; }
        if (sku.frozen && !hasFreezer.has(st.id)) { arr.push(0); continue; }
        const date = addDays(startDate, i);
        let u = baseUnits(seed, st, sku, i, date) * scenarioFactor(idx, sku, i, T);
        if (idx === SCENARIO.relocation && sku.frozen) u = Math.max(1, u);
        arr.push(Math.round(u));
      }
      sales[st.id][sku.id] = arr;
    }
  });

  // ---------- deliveries ----------
  const deliveries: Delivery[] = [];
  stores.forEach((st, idx) => {
    for (let d = -21; d <= 3; d++) {
      const date = addDays(opts.today, d);
      const wd = weekday(date);
      if (wd === 7) continue;
      const isDay = st.visitDays.map((v) => (v % 6) + 1).includes(wd);
      if (!isDay) continue;
      const del: Delivery = { id: uid('dl_'), storeId: st.id, plannedDate: date, status: d >= 0 ? 'planned' : 'delivered', fillRate: d >= 0 ? 1 : Math.round(r.range(0.95, 1) * 100) / 100 };
      if (d < 0) del.actualDate = date;
      if (idx === SCENARIO.delivery && d < 0 && d >= -7) {
        del.status = d >= -4 ? 'short' : 'delayed';
        del.actualDate = addDays(date, d >= -4 ? 0 : 2);
        del.fillRate = d >= -4 ? 0.55 : 0.8;
        del.note = d >= -4 ? 'Недогруз: кефир 1 л, молоко 2,5% отсутствовали на складе' : 'Задержка: машина не вышла на маршрут';
      }
      if (idx === SCENARIO.debt && d >= -9) {
        del.status = 'blocked';
        del.fillRate = 0;
        del.actualDate = undefined;
        del.note = 'Отгрузка заблокирована: просроченная дебиторская задолженность';
      }
      deliveries.push(del);
    }
  });

  // ---------- visits ----------
  const visits: Visit[] = [];
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  reps.forEach((rep, ri) => {
    for (let d = -21; d <= 0; d++) {
      const date = addDays(opts.today, d);
      const wd = weekday(date);
      const route = stores.filter((s) => s.repId === rep.id && s.visitDays.includes(wd));
      route.forEach((st, k) => {
        const idx = stores.indexOf(st);
        const startH = 9.5 + k * 1.25;
        const v: Visit = { id: uid('v_'), storeId: st.id, repId: rep.id, date, status: 'planned', photoIds: [], reportDone: false, flags: [] };
        const isToday = d === 0;
        const keepPlanned = isToday && (ri === 0 ? k >= 1 : startH + 0.7 > nowH);
        if (!keepPlanned) {
          const erlanMiss = ri === 1 && d >= -9 && d < 0 && r.chance(0.5);
          const randomMiss = d < 0 && r.chance(0.035);
          if (erlanMiss || randomMiss) {
            v.status = 'missed';
          } else {
            const tIn = at(date, Math.floor(startH), Math.round((startH % 1) * 60) + r.int(-10, 10));
            const short = r.chance(ri === 1 ? 0.3 : 0.05);
            const dur = short ? r.int(2, 4) : r.int(14, 32);
            const dist = r.range(8, 85);
            v.status = 'done';
            v.checkIn = { t: tIn, lat: st.lat, lng: st.lng, accuracy: r.int(6, 25), distance: Math.round(dist), inZone: true, simulated: false };
            v.checkOutAt = tIn + dur * 60000;
            if (short) v.flags.push('Короткий визит');
            v.stock = Object.fromEntries(SKUS.filter((s) => !s.frozen || hasFreezer.has(st.id)).map((s) => [s.id, r.chance(0.08) ? 'low' : 'ok']));
            const fz = freezers.find((f) => f.storeId === st.id);
            if (fz) v.freezerChecks = [{ freezerId: fz.id, present: true, working: true, filled: 'full', ownGoodsOnly: true }];
            v.competitor = { active: r.chance(0.1) };
            const order: Record<string, number> = {};
            let total = 0;
            for (const s of SKUS) {
              if (s.frozen && !fz) continue;
              const q = Math.round(st.volume * s.popularity * r.range(1.2, 2.2));
              order[s.id] = q;
              total += q * s.price;
            }
            v.order = order;
            v.orderTotal = total;
            v.reportDone = true;
          }
        }
        // scenario details on the latest visits
        if (v.status === 'done') {
          if (idx === SCENARIO.delivery && d >= -3) { v.stock!.kefir = 'out'; v.stock!.milk25 = 'low'; v.comment = 'Кефира нет на полке второй день, ждём поставку'; }
          if (idx === SCENARIO.price && d >= -6) { v.competitor = { active: true, priceIndex: 1.18, note: 'Конкурент снизил цену на питьевой йогурт и айран, акция 1+1' }; }
          if (idx === SCENARIO.noSales && d >= -4) { v.freezerChecks = [{ freezerId: fzByStore(idx).id, present: true, working: true, filled: 'half', ownGoodsOnly: false }]; v.comment = 'В морозильнике лежит чужой товар, наш — в нижнем ряду'; }
          if (idx === SCENARIO.missing && d >= -2) { v.freezerChecks = [{ freezerId: fzByStore(idx).id, present: false, working: false, filled: 'empty', ownGoodsOnly: false }]; v.comment = 'Морозильника нет на месте. Со слов продавца — забрали «на ремонт» неделю назад'; v.flags.push('Оборудование отсутствует'); }
          if (idx === SCENARIO.reportMissing && d === -1) { v.reportDone = false; v.stock = undefined; v.order = undefined; v.orderTotal = undefined; v.freezerChecks = undefined; }
        }
        visits.push(v);
      });
    }
  });
  // make sure the report-missing scenario has a visit yesterday
  const yesterday = addDays(opts.today, -1);
  const rmStore = S(SCENARIO.reportMissing);
  if (!visits.some((v) => v.storeId === rmStore.id && v.date === yesterday)) {
    const tIn = at(yesterday, 16, 10);
    visits.push({ id: uid('v_'), storeId: rmStore.id, repId: rmStore.repId, date: yesterday, status: 'done', checkIn: { t: tIn, lat: rmStore.lat, lng: rmStore.lng, accuracy: 12, distance: 34, inZone: true, simulated: false }, checkOutAt: tIn + 18 * 60000, photoIds: [], reportDone: false, flags: [] });
  }

  // freezer statuses for scenarios
  const fzMissing = fzByStore(SCENARIO.missing);
  fzMissing.status = 'missing';
  fzMissing.history.push({ t: at(addDays(opts.today, -2), 12), text: 'При визите оборудование не обнаружено (фотоотчёт представителя)' });
  fzMissing.lastVerifiedAt = addDays(opts.today, -5);
  const fzTemp = fzByStore(SCENARIO.temperature);
  fzTemp.hasSensor = true;
  fzTemp.fault = true;

  // ---------- temperatures (72 h hourly) ----------
  const temps: Record<string, number[]> = {};
  const nowHour = new Date();
  nowHour.setMinutes(0, 0, 0);
  for (const f of freezers.filter((x) => x.hasSensor && x.storeId)) {
    temps[f.id] = Array.from({ length: 72 }, (_, h) => {
      const base = -19.5 + Math.sin(h / 3.8) * 0.9 + r.range(-0.6, 0.6);
      if (f.fault && h >= 68) return Math.round((-12.5 + r.range(-0.8, 0.8)) * 10) / 10;
      return Math.round(base * 10) / 10;
    });
  }

  const ws: Workspace = {
    id: wsId,
    company: opts.company,
    createdAt: Date.now(),
    demo: opts.demo,
    seedDay: opts.today,
    startDate,
    seed,
    skus: SKUS,
    stores,
    freezers,
    deliveries,
    visits,
    sales,
    temps,
    tempsAt: nowHour.getTime(),
    signals: {},
    tasks: [],
    notices: [],
    invites: [],
    settings: { ...DEFAULT_SETTINGS },
    audit: [{ t: Date.now(), by: 'DairyHub', text: 'Рабочее пространство создано и заполнено демонстрационными данными' }],
  };
  return { ws, people };
}

/** Bring a stored workspace up to date when days have passed since it was generated. */
export function extendWorkspace(ws: Workspace, todayStr: string): boolean {
  let changed = false;
  const T = dayDiff(ws.startDate, todayStr);
  const anySeries = Object.values(Object.values(ws.sales)[0] ?? {})[0] ?? [];
  const have = anySeries.length - 1; // last index present
  if (T > have) {
    for (const st of ws.stores) {
      const fzOk = ws.freezers.some((f) => f.storeId === st.id && (f.status === 'installed' || f.status === 'repair'));
      for (const sku of ws.skus) {
        const arr = ws.sales[st.id][sku.id];
        for (let i = arr.length; i <= T; i++) {
          if (i === T) { arr.push(0); continue; }
          if (sku.frozen && !fzOk) { arr.push(0); continue; }
          const date = addDays(ws.startDate, i);
          let u = baseUnits(ws.seed, st, sku, i, date);
          if (st.shipmentsBlocked) u *= 0.22;
          arr.push(Math.round(u));
        }
      }
    }
    // plan today's routes
    for (let d = have + 1; d <= T; d++) {
      const date = addDays(ws.startDate, d);
      const wd = weekday(date);
      for (const st of ws.stores) {
        if (!st.visitDays.includes(wd)) continue;
        if (ws.visits.some((v) => v.storeId === st.id && v.date === date)) continue;
        ws.visits.push({ id: uid('v_'), storeId: st.id, repId: st.repId, date, status: d < T ? 'missed' : 'planned', photoIds: [], reportDone: false, flags: [] });
      }
    }
    changed = true;
  }
  // temperatures
  const nowHour = new Date();
  nowHour.setMinutes(0, 0, 0);
  const hours = Math.floor((nowHour.getTime() - ws.tempsAt) / 3600000);
  if (hours > 0) {
    const r = rng(hashStr(ws.id + nowHour.getTime()));
    for (const [fid, arr] of Object.entries(ws.temps)) {
      const f = ws.freezers.find((x) => x.id === fid);
      for (let h = 0; h < Math.min(hours, 72); h++) {
        const v = f?.fault ? -12.5 + r.range(-0.8, 0.8) : -19.5 + r.range(-0.9, 0.9);
        arr.push(Math.round(v * 10) / 10);
      }
      ws.temps[fid] = arr.slice(-72);
    }
    ws.tempsAt = nowHour.getTime();
    changed = true;
  }
  return changed;
}

export function distanceToStore(st: Store, lat: number, lng: number): number {
  return haversine(st.lat, st.lng, lat, lng);
}

export { CATEGORY_COEF };
