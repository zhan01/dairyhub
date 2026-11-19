import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hub } from '../../api/hub';
import { compressImage, photoStore } from '../../api/storage';
import { dayIndex, sumRange } from '../../domain/engine';
import type { FreezerCheck, StockLevel } from '../../domain/types';
import { NO_SALES_CAUSES } from '../../domain/types';
import { fmtDay, fmtTime } from '../../lib/date';
import { haversine } from '../../lib/geo';
import { money } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { MapView } from '../../ui/MapView';
import { Empty, Field, Seg, Spinner, Stepper, Switch, useAction, useHub, useToast } from '../../ui/kit';
import { usePosition } from './RepApp';

const STEPS = ['Наличие', 'Оборудование', 'Конкуренты', 'Фото', 'Заказ', 'Итог'];

function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void photoStore.get(id).then(setSrc); }, [id]);
  return src ? <img src={src} alt="Фотоотчёт" /> : <div className="photo-add"><Spinner /></div>;
}

export function VisitFlow() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const v = ws.visits.find((x) => x.id === id);
  const [step, setStep] = useState(0);
  if (!v) return <Empty title="Визит не найден" />;
  const store = ws.stores.find((x) => x.id === v.storeId)!;
  if (!v.checkIn) return <CheckIn visitId={v.id} />;
  const readOnly = v.status === 'done' && v.reportDone;
  return (
    <>
      <div className="nav-bar glass">
        <button className="back" onClick={() => nav('/rep')}><Icon name="chevL" size={22} />Маршрут</button>
        <span className="title ellipsis">{store.name}</span>
        <span className="t-foot sec" style={{ width: 70, textAlign: 'right', paddingRight: 6 }}>{fmtTime(v.checkIn.t)}</span>
      </div>
      {readOnly ? <Summary visitId={v.id} readOnly /> : (
        <div className="pad" style={{ paddingTop: 8 }}>
          <div className="steps">{STEPS.map((x, i) => <i key={x} className={i <= step ? 'on' : ''} />)}</div>
          <div className="row between mt8"><span className="t-foot sec">Шаг {step + 1} из {STEPS.length}</span><span className="t-foot bold">{STEPS[step]}</span></div>
          {v.status === 'done' && !v.reportDone && <div className="info-box t-foot mt8">Визит завершён без отчёта. Заполните его — напоминание исчезнет.</div>}
          <div className="mt16">
            {step === 0 && <StockStep visitId={v.id} />}
            {step === 1 && <EquipmentStep visitId={v.id} />}
            {step === 2 && <CompetitorStep visitId={v.id} />}
            {step === 3 && <PhotoStep visitId={v.id} />}
            {step === 4 && <OrderStep visitId={v.id} />}
            {step === 5 && <Summary visitId={v.id} />}
          </div>
          <div className="row gap8 mt24" style={{ paddingBottom: 24 }}>
            {step > 0 && <button className="btn lg grow" onClick={() => { setStep(step - 1); window.scrollTo(0, 0); }}>Назад</button>}
            {step < STEPS.length - 1 && <button className="btn primary lg grow" onClick={() => { setStep(step + 1); window.scrollTo(0, 0); }}>Далее</button>}
          </div>
        </div>
      )}
    </>
  );
}

function CheckIn({ visitId }: { visitId: string }) {
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const v = ws.visits.find((x) => x.id === visitId)!;
  const store = ws.stores.find((x) => x.id === v.storeId)!;
  const { pos, err } = usePosition();
  const [sim, setSim] = useState(false);
  const [comment, setComment] = useState('');
  const { run, busy } = useAction();
  const simPos = useMemo(() => ({ lat: store.lat + 0.00018, lng: store.lng - 0.00012, accuracy: 12 }), [store]);
  const cur = sim ? simPos : pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : null;
  const dist = cur ? haversine(cur.lat, cur.lng, store.lat, store.lng) : null;
  const inZone = dist !== null && dist <= ws.settings.geofenceM;
  const points: { id: string; lat: number; lng: number; color: string; label: string }[] = [{ id: store.id, lat: store.lat, lng: store.lng, color: '#0a84ff', label: store.category }];
  if (cur && dist !== null && dist < 30000) points.push({ id: 'me', lat: cur.lat, lng: cur.lng, color: '#34c759', label: '' });
  return (
    <>
      <div className="nav-bar glass">
        <button className="back" onClick={() => nav(-1)}><Icon name="chevL" size={22} />Назад</button>
        <span className="title ellipsis">Отметка о прибытии</span>
        <span style={{ width: 70 }} />
      </div>
      <div className="pad col gap16" style={{ paddingTop: 8 }}>
        <div><div className="t-title2">{store.name}</div><div className="t-foot sec">{store.address} · {fmtDay(v.date)}</div></div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><MapView className="sm" points={points} radius={{ lat: store.lat, lng: store.lng, m: ws.settings.geofenceM }} /></div>
        <div className="list">
          <div className="cell"><span className="cell-icon" style={{ background: cur ? (inZone ? 'var(--green)' : 'var(--orange)') : 'var(--gray)' }}><Icon name="location" size={16} /></span>
            <div className="cell-main"><div className="cell-title">{cur ? (inZone ? 'Вы в геозоне точки' : 'Вы вне геозоны') : err ?? 'Определяем местоположение…'}</div>
              <div className="cell-sub">{dist !== null ? `${dist < 1000 ? `${Math.round(dist)} м` : `${(dist / 1000).toFixed(1).replace('.', ',')} км`} до точки · радиус ${ws.settings.geofenceM} м · точность ±${Math.round(cur!.accuracy)} м` : 'Разрешите доступ к геолокации в браузере'}</div></div>
            {!cur && !err && <Spinner />}
          </div>
          <div className="cell">
            <div className="cell-main"><div className="cell-title">Демо-режим GPS</div><div className="cell-sub">Имитировать нахождение в точке (для показа экспертам вне Алматы). Визит будет помечен «Демо-GPS».</div></div>
            <Switch checked={sim} onChange={setSim} label="Демо-режим GPS" />
          </div>
        </div>
        {cur && cur.accuracy > 100 && <div className="info-box t-foot">Низкая точность GPS (±{Math.round(cur.accuracy)} м). Выйдите на открытое место или подождите несколько секунд.</div>}
        {cur && !inZone && <Field label="Причина отметки вне геозоны (обязательно)"><textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: точка переехала в соседнее здание" /></Field>}
        <button className="btn primary lg block" disabled={!cur || busy || (!inZone && !comment.trim())} onClick={async () => {
          const r = await run(() => hub.checkIn(visitId, { lat: cur!.lat, lng: cur!.lng, accuracy: cur!.accuracy, simulated: sim }, comment), 'Визит начат · время зафиксировано');
          if (r) window.scrollTo(0, 0);
        }}><Icon name="location" size={18} />Отметиться и начать визит</button>
        <div className="hint" style={{ textAlign: 'center' }}>Время и координаты фиксируются автоматически и не редактируются</div>
      </div>
    </>
  );
}

function useVisit(visitId: string) {
  const s = useHub();
  const ws = s.ws!;
  const v = ws.visits.find((x) => x.id === visitId)!;
  const store = ws.stores.find((x) => x.id === v.storeId)!;
  const fz = ws.freezers.filter((f) => f.storeId === store.id || v.freezerChecks?.some((c) => c.freezerId === f.id));
  const skus = ws.skus.filter((k) => !k.frozen || fz.length > 0);
  return { s, ws, v, store, fz, skus };
}

function StockStep({ visitId }: { visitId: string }) {
  const { v, skus } = useVisit(visitId);
  const stock = v.stock ?? {};
  const set = (k: string, val: StockLevel) => hub.saveVisit(visitId, { stock: { ...stock, [k]: val } });
  return (
    <div className="col gap12">
      <div className="row between"><span className="t-title3">Наличие на полке</span><button className="btn sm" onClick={() => hub.saveVisit(visitId, { stock: Object.fromEntries(skus.map((k) => [k.id, 'ok'])) })}>Всё есть</button></div>
      <div className="list">
        {skus.map((k) => (
          <div key={k.id} className="cell" style={{ flexWrap: 'wrap' }}>
            <div className="cell-main"><div className="cell-title">{k.name}</div></div>
            <Seg value={(stock[k.id] ?? '') as StockLevel} onChange={(x) => set(k.id, x)} options={[{ value: 'ok', label: 'Есть' }, { value: 'low', label: 'Мало' }, { value: 'out', label: 'Нет' }]} />
          </div>
        ))}
      </div>
      <div className="hint">«Нет» и «Мало» используются DairyHub для поиска причин падения продаж и проверки поставок склада.</div>
    </div>
  );
}

function EquipmentStep({ visitId }: { visitId: string }) {
  const { v, fz } = useVisit(visitId);
  const { run } = useAction();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  if (!fz.length) return <div className="card"><Empty icon="freezer" title="В точке нет оборудования компании" text="Шаг можно пропустить" /></div>;
  const checks = v.freezerChecks ?? [];
  const get = (id: string): FreezerCheck => checks.find((c) => c.freezerId === id) ?? { freezerId: id, present: true, working: true, filled: 'full', ownGoodsOnly: true };
  const save = (c: FreezerCheck) => hub.saveVisit(visitId, { freezerChecks: [...checks.filter((x) => x.freezerId !== c.freezerId), c] });
  return (
    <div className="col gap16">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f || !target) return;
        try {
          const data = await compressImage(f);
          const pid = await hub.addPhoto(visitId, data);
          await save({ ...get(target), photoId: pid });
          toast('Фото оборудования сохранено');
        } catch { toast('Не удалось обработать фото', true); }
      }} />
      {fz.map((f) => {
        const c = get(f.id);
        const saved = checks.some((x) => x.freezerId === f.id);
        return (
          <div key={f.id} className="col gap8">
            <div className="row between"><span className="t-title3">Морозильник {f.serial}</span>{saved ? <span className="badge green">Проверен</span> : <span className="badge orange">Не проверен</span>}</div>
            <div className="list">
              <div className="cell"><div className="cell-main"><div className="cell-title">Оборудование на месте</div><div className="cell-sub">{f.model}</div></div><Switch checked={c.present} onChange={(x) => save({ ...c, present: x })} label="На месте" /></div>
              {c.present && <>
                <div className="cell"><div className="cell-main cell-title">Работает исправно</div><Switch checked={c.working} onChange={(x) => save({ ...c, working: x })} label="Работает" /></div>
                <div className="cell" style={{ flexWrap: 'wrap' }}><div className="cell-main cell-title" style={{ minWidth: 140 }}>Заполненность</div><Seg value={c.filled} onChange={(x) => save({ ...c, filled: x })} options={[{ value: 'full', label: 'Полный' }, { value: 'half', label: 'Половина' }, { value: 'empty', label: 'Пустой' }]} /></div>
                <div className="cell"><div className="cell-main"><div className="cell-title">Только наша продукция</div><div className="cell-sub">Нет товаров конкурентов</div></div><Switch checked={c.ownGoodsOnly} onChange={(x) => save({ ...c, ownGoodsOnly: x })} label="Только наша продукция" /></div>
              </>}
            </div>
            {!c.present && <div className="error-box t-foot">Руководитель получит сигнал «Оборудование отсутствует» с вашей GPS-отметкой. Опишите ситуацию в комментарии на шаге «Итог».</div>}
            {c.present && (
              <div className="row gap8">
                {c.photoId && <div style={{ width: 72 }}><Thumb id={c.photoId} /></div>}
                <button className="btn grow" onClick={() => { setTarget(f.id); input.current?.click(); }}><Icon name="camera" size={18} />{c.photoId ? 'Переснять' : 'Фото оборудования'}</button>
                {!saved && <button className="btn primary" onClick={() => save(c)}>Подтвердить</button>}
              </div>
            )}
            {!c.present && !saved && <button className="btn danger" onClick={() => save(c)}>Подтвердить отсутствие</button>}
            {f.program && f.program.stage <= 2 && (
              <div className="card" style={{ padding: 14 }}>
                <div className="t-headline">Диагностика: почему нет продаж?</div>
                <div className="t-foot sec mt4">Этап {f.program.stage} программы. Отметьте подтвердившиеся причины.</div>
                <div className="col gap8 mt12">
                  {NO_SALES_CAUSES.map((k) => (
                    <label key={k.id} className="check t-foot"><input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--blue)' }} checked={!!f.program!.checklist[k.id]} onChange={(e) => run(() => hub.programUpdate(f.id, { checklist: { [k.id]: e.target.checked } }))} /><span><b>{k.label}</b><span className="sec"> — {k.hint}</span></span></label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompetitorStep({ visitId }: { visitId: string }) {
  const { v, store } = useVisit(visitId);
  const c = v.competitor ?? { active: false, priceIndex: store.priceIndex };
  const set = (patch: Partial<typeof c>) => hub.saveVisit(visitId, { competitor: { ...c, ...patch } });
  const pi = Math.round((c.priceIndex ?? store.priceIndex) * 100);
  return (
    <div className="col gap16">
      <span className="t-title3">Конкуренты и цены</span>
      <div className="list">
        <div className="cell"><div className="cell-main"><div className="cell-title">Активность конкурентов</div><div className="cell-sub">Акции, новый морозильник, лучшая выкладка</div></div><Switch checked={c.active} onChange={(x) => set({ active: x })} label="Активность конкурентов" /></div>
      </div>
      <Field label={`Наша цена к цене конкурента: ${pi}%`} hint={pi > 110 ? 'Выше порога 110% — DairyHub учтёт цену как возможную причину' : 'Порог неконкурентной цены — 110%'}>
        <input type="range" min={80} max={140} value={pi} onChange={(e) => set({ priceIndex: Number(e.target.value) / 100 })} style={{ width: '100%', accentColor: pi > 110 ? 'var(--red)' : 'var(--blue)' }} />
      </Field>
      <Field label="Наблюдения"><textarea className="input" value={c.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Например: конкурент проводит акцию 1+1 на йогурты" /></Field>
    </div>
  );
}

function PhotoStep({ visitId }: { visitId: string }) {
  const { v } = useVisit(visitId);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="col gap12">
      <span className="t-title3">Фотоотчёт</span>
      <div className="t-foot sec">Полка, морозильник, ценники. На фото автоматически ставится дата и время.</div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (e) => {
        const files = [...(e.target.files ?? [])].slice(0, 6);
        e.target.value = '';
        setBusy(true);
        try { for (const f of files) await hub.addPhoto(visitId, await compressImage(f)); if (files.length) toast(`Добавлено фото: ${files.length}`); } catch { toast('Не удалось обработать фото', true); } finally { setBusy(false); }
      }} />
      <div className="photo-grid">
        {v.photoIds.map((p) => <Thumb key={p} id={p} />)}
        <button className="photo-add" onClick={() => input.current?.click()} disabled={busy} aria-label="Добавить фото">{busy ? <Spinner /> : <Icon name="camera" size={28} />}</button>
      </div>
      {v.photoIds.length === 0 && <div className="hint">Для отчёта нужно минимум одно фото.</div>}
    </div>
  );
}

function OrderStep({ visitId }: { visitId: string }) {
  const { ws, v, store, skus, s } = useVisit(visitId);
  const order = v.order ?? {};
  const T = dayIndex(ws, s.today);
  const suggest = useMemo(() => Object.fromEntries(skus.map((k) => {
    const per = sumRange(ws.sales[store.id][k.id], T - 28, T - 1) / 28;
    const days = 7 / Math.max(1, store.visitDays.length);
    const st = v.stock?.[k.id];
    return [k.id, Math.max(0, Math.round(per * days * (st === 'out' ? 1.4 : st === 'low' ? 1.2 : 1)))];
  })), [skus, ws, store, T, v.stock]);
  const total = Object.entries(order).reduce((a, [k, q]) => a + q * (ws.skus.find((x) => x.id === k)?.price ?? 0), 0);
  return (
    <div className="col gap12">
      <div className="row between"><span className="t-title3">Заказ</span><button className="btn sm" onClick={() => hub.saveVisit(visitId, { order: suggest })}><Icon name="sparkles" size={14} />Рекомендованный</button></div>
      {store.shipmentsBlocked && <div className="error-box t-foot">Отгрузки клиенту заблокированы из-за задолженности. Заказ будет сохранён, но отгружен только после разблокировки бухгалтерией.</div>}
      <div className="list">
        {skus.map((k) => (
          <div key={k.id} className="cell">
            <div className="cell-main"><div className="cell-title">{k.short}</div><div className="cell-sub">{money(k.price)} · рекоменд. {suggest[k.id]}</div></div>
            <Stepper value={order[k.id] ?? 0} onChange={(q) => hub.saveVisit(visitId, { order: { ...order, [k.id]: q } })} />
          </div>
        ))}
      </div>
      <div className="card row between"><span className="t-headline">Итого</span><span className="t-title3 num">{money(total)}</span></div>
      <div className="hint">Рекомендация = средние продажи за 4 недели × дней до следующего визита, с поправкой на дефицит на полке.</div>
    </div>
  );
}

function Summary({ visitId, readOnly }: { visitId: string; readOnly?: boolean }) {
  const { ws, v, store, fz } = useVisit(visitId);
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(i); }, []);
  const stockN = Object.keys(v.stock ?? {}).length;
  const out = Object.values(v.stock ?? {}).filter((x) => x === 'out').length;
  const checks = [
    { ok: stockN > 0, t: 'Наличие продукции', d: stockN ? `${stockN} позиций${out ? `, нет в наличии: ${out}` : ''}` : 'не заполнено' },
    { ok: !fz.length || (v.freezerChecks?.length ?? 0) >= fz.length, t: 'Оборудование', d: fz.length ? `${v.freezerChecks?.length ?? 0} из ${fz.length} проверено` : 'нет в точке' },
    { ok: v.photoIds.length > 0, t: 'Фотоотчёт', d: `${v.photoIds.length} фото` },
    { ok: true, t: 'Заказ', d: v.orderTotal ? money(v.orderTotal) : 'без заказа' },
  ];
  const ready = checks.every((c) => c.ok);
  const mins = Math.round(((v.checkOutAt ?? Date.now()) - v.checkIn!.t) / 60000);
  return (
    <div className={`col gap16 ${readOnly ? 'pad' : ''}`} style={readOnly ? { paddingTop: 12 } : undefined}>
      <div className="card">
        <div className="row between"><span className="t-foot sec">Визит</span><span className={`badge ${v.status === 'done' ? 'green' : 'blue'}`}>{v.status === 'done' ? 'Завершён' : 'Идёт'}</span></div>
        <div className="t-title2 mt4">{mins} мин</div>
        <div className="t-foot sec">Начало {fmtTime(v.checkIn!.t)}{v.checkOutAt ? ` · окончание ${fmtTime(v.checkOutAt)}` : ''} · {v.checkIn!.distance} м от точки{v.checkIn!.simulated ? ' · демо-GPS' : ''}</div>
        {v.flags.length > 0 && <div className="row gap4 wrap mt8">{v.flags.map((f) => <span key={f} className="badge orange">{f}</span>)}</div>}
      </div>
      <div className="list">
        {checks.map((c) => <div key={c.t} className="cell"><span className="cell-icon" style={{ background: c.ok ? 'var(--green)' : 'var(--orange)' }}><Icon name={c.ok ? 'check' : 'alert'} size={16} /></span><div className="cell-main"><div className="cell-title">{c.t}</div><div className="cell-sub">{c.d}</div></div></div>)}
      </div>
      {!readOnly && <Field label="Комментарий к визиту"><textarea className="input" value={v.comment ?? ''} onChange={(e) => hub.saveVisit(visitId, { comment: e.target.value })} placeholder="Что важно знать руководителю" /></Field>}
      {readOnly && v.comment && <div className="card t-sub">«{v.comment}»</div>}
      {!readOnly && (
        <>
          {!ready && <div className="info-box t-foot">Отчёт не полный. Можно завершить визит без отчёта — DairyHub напомнит заполнить его через 30 минут.</div>}
          {mins < 5 && v.status !== 'done' && <div className="info-box t-foot">Визит короче 5 минут будет помечен как «короткий».</div>}
          <button className="btn success lg block" disabled={busy || !ready} onClick={async () => { const r = await run(() => hub.finishVisit(visitId, true).then(() => true), v.status === 'done' ? 'Отчёт сохранён' : 'Визит завершён'); if (r) nav('/rep'); }}><Icon name="check" size={18} />{v.status === 'done' ? 'Сохранить отчёт' : 'Завершить визит с отчётом'}</button>
          {v.status !== 'done' && <button className="btn lg block" disabled={busy} onClick={async () => { const r = await run(() => hub.finishVisit(visitId, false).then(() => true), 'Визит завершён — заполните отчёт позже'); if (r) nav('/rep'); }}>Завершить без отчёта</button>}
        </>
      )}
      {readOnly && <button className="btn lg block" onClick={() => nav('/rep')}>К маршруту</button>}
      <div className="hint" style={{ textAlign: 'center' }}>{store.name} · {ws.company}</div>
    </div>
  );
}
