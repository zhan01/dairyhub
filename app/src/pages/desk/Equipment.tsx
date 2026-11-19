import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hub, personName } from '../../api/hub';
import { photoStore } from '../../api/storage';
import { dayIndex, freezerRevenue, relocationAssessment, storeRevenue, tempOverHours } from '../../domain/engine';
import type { FreezerStatus } from '../../domain/types';
import { FREEZER_STATUS_LABEL, NO_SALES_CAUSES, PROGRAM_STAGES } from '../../domain/types';
import { addDays, fmtDateTime, fmtDay, fmtDayShort } from '../../lib/date';
import { money, moneyShort } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Columns } from '../../ui/charts';
import { Card, Empty, Field, Kpi, Seg, Sheet, useAction, useHub } from '../../ui/kit';
import { BackLink, PageHead, SignalRow, storeName } from './common';

export function Equipment() {
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const [f, setF] = useState<'all' | 'problem' | 'sensor' | 'program'>('all');
  const rows = useMemo(() => ws.freezers.map((z) => ({ z, rev: z.storeId ? freezerRevenue(ws, z.storeId, s.today) : 0, temp: ws.temps[z.id]?.[ws.temps[z.id].length - 1] })), [ws, s.today, s.version]);
  const list = rows.filter(({ z }) => f === 'all' || (f === 'problem' ? z.status !== 'installed' && z.status !== 'warehouse' || z.fault : f === 'sensor' ? z.hasSensor : !!z.program));
  const cnt = (st: FreezerStatus) => ws.freezers.filter((z) => z.status === st).length;
  return (
    <>
      <PageHead title="Оборудование" sub="Единая база морозильников: закрепление за точками, фотоподтверждение, датчики, ремонт и перенос" />
      <div className="grid g4">
        <Kpi icon="freezer" color="var(--teal)" label="Установлено" value={String(cnt('installed'))} foot={`всего ${ws.freezers.length}, на складе ${cnt('warehouse')}`} />
        <Kpi icon="alert" color="var(--red)" label="Не обнаружено" value={String(cnt('missing'))} foot="по отметкам представителей" />
        <Kpi icon="thermo" color="var(--orange)" label="Датчики температуры" value={String(ws.freezers.filter((z) => z.hasSensor).length)} foot={`тревог: ${ws.freezers.filter((z) => ws.temps[z.id] && tempOverHours(ws.temps[z.id], ws.settings.tempLimit) >= ws.settings.tempHours).length}`} />
        <Kpi icon="snow" color="var(--blue)" label="В программе «без продаж»" value={String(ws.freezers.filter((z) => z.program).length)} foot="4 этапа восстановления" />
      </div>
      <div className="row gap8 mt16" style={{ marginBottom: 12 }}><Seg value={f} onChange={setF} options={[{ value: 'all', label: 'Все' }, { value: 'problem', label: 'Проблемные' }, { value: 'sensor', label: 'С датчиком' }, { value: 'program', label: 'Программа' }]} /></div>
      <Card pad0>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Серийный №</th><th>Точка</th><th>Статус</th><th className="r hide-sm">Подтверждён</th><th className="r">Темп.</th><th className="r">Выручка 30 дн</th><th className="hide-sm">Программа</th></tr></thead>
            <tbody>{list.map(({ z, rev, temp }) => (
              <tr key={z.id} className="click" onClick={() => nav(`/app/equipment/${z.id}`)}>
                <td><b>{z.serial}</b><div className="t-cap sec">{z.model}</div></td>
                <td>{z.storeId ? storeName(z.storeId) : <span className="sec">Склад</span>}</td>
                <td><span className={`badge ${z.status === 'installed' && !z.fault ? 'green' : z.status === 'warehouse' ? '' : 'red'}`}>{z.fault ? 'Температура!' : FREEZER_STATUS_LABEL[z.status]}</span></td>
                <td className="r hide-sm sec">{z.lastVerifiedAt ? fmtDayShort(z.lastVerifiedAt) : '—'}</td>
                <td className="r">{temp !== undefined ? <span className={temp > ws.settings.tempLimit ? 'delta-down' : ''}>{temp.toFixed(1).replace('.', ',').replace('-', '−')}°</span> : <span className="ter">—</span>}</td>
                <td className={`r ${z.storeId && rev < ws.settings.freezerMinRevenue ? 'delta-down' : ''}`}>{z.storeId ? moneyShort(rev) : '—'}</td>
                <td className="hide-sm">{z.program ? <span className="badge blue">Этап {z.program.stage}: {PROGRAM_STAGES[z.program.stage - 1]}</span> : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Photo({ id }: { id: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void photoStore.get(id).then(setSrc); }, [id]);
  return src ? <img src={src} alt="Фото оборудования" style={{ borderRadius: 12 }} /> : null;
}

export function FreezerDetail() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const z = ws.freezers.find((x) => x.id === id);
  const canEdit = s.user!.role !== 'accounting';
  const isMgr = s.user!.role === 'manager' || s.user!.role === 'admin';
  const { run, busy } = useAction();
  const [statusS, setStatusS] = useState(false);
  const [move, setMove] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [action, setAction] = useState('');
  const T = dayIndex(ws, s.today);
  const ra = useMemo(() => (z?.storeId && z.program ? relocationAssessment(ws, z, s.today) : null), [z, ws, s.today, s.version]);
  if (!z) return <Empty title="Оборудование не найдено" />;
  const store = ws.stores.find((x) => x.id === z.storeId);
  const rev = store ? storeRevenue(ws, store.id, (k) => ws.skus.find((x) => x.id === k)!.frozen).slice(T - 35, T) : [];
  const sigs = Object.values(ws.signals).filter((x) => x.freezerId === z.id && x.status !== 'resolved' && x.status !== 'dismissed');
  const fcPhoto = ws.visits.filter((v) => v.freezerChecks?.some((c) => c.freezerId === z.id && c.photoId)).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.freezerChecks?.find((c) => c.freezerId === z.id)?.photoId;

  return (
    <>
      <BackLink to="/app/equipment" label="Оборудование" />
      <PageHead title={`Морозильник ${z.serial}`} sub={`${z.model} · ${store ? store.name : 'на складе'} · установлен ${fmtDay(z.installedAt)}${z.hasSensor ? ' · датчик температуры' : ''}`} actions={canEdit ? <button className="btn" onClick={() => setStatusS(true)}>Изменить статус</button> : undefined} />
      {sigs.length > 0 && <Card pad0 className="mt8">{sigs.map((x) => <SignalRow key={x.id} s={x} />)}</Card>}
      <div className="grid g-2-1 mt16">
        <div className="col gap16">
          {store && <Card title="Продажи мороженого · 35 дней"><Columns values={rev} labels={rev.map((_, i) => fmtDayShort(addDays(s.today, i - 35)))} color="var(--teal)" /><div className="row between t-foot mt8"><span className="sec">Выручка за 30 дней</span><b>{money(freezerRevenue(ws, store.id, s.today))}</b></div><div className="row between t-foot"><span className="sec">Минимальная выручка окупаемости (параметр компании)</span><b>{money(ws.settings.freezerMinRevenue)}</b></div></Card>}
          {z.hasSensor && ws.temps[z.id] && <Card title="Температура · 72 часа"><Columns values={ws.temps[z.id].map((t) => t + 30)} labels={ws.temps[z.id].map((_, i) => `${72 - i} ч`)} color="var(--teal)" highlightFrom={z.fault ? ws.temps[z.id].length - tempOverHours(ws.temps[z.id], ws.settings.tempLimit) : undefined} format={(n) => `${(n - 30).toFixed(1).replace('.', ',')} °C`} /></Card>}
          {store && (
            <Card title="Программа «Морозильник без продаж»">
              <div className="chain" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                {PROGRAM_STAGES.map((t, i) => <div key={t} className={`chain-step ${z.program && i + 1 < z.program.stage ? 'done' : ''} ${z.program?.stage === i + 1 ? 'cur' : ''}`}><div className="n">{i + 1}</div><div className="t-foot bold">{t}</div></div>)}
              </div>
              {!z.program ? <div className="t-sub sec mt12">Программа запускается автоматически, если продаж нет {ws.settings.zeroSalesDays} дня подряд.{isMgr && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => run(() => hub.programUpdate(z.id, { action: 'Программа запущена вручную' }), 'Программа запущена')}>Запустить вручную</button>}</div> : (
                <>
                  <div className="group-title" style={{ paddingLeft: 0 }}>Диагностика: 6 возможных причин</div>
                  <div className="list">
                    {NO_SALES_CAUSES.map((c) => {
                      const v = z.program!.checklist[c.id];
                      return (
                        <div key={c.id} className="cell">
                          <div className="cell-main"><div className="cell-title">{c.label}</div><div className="cell-sub">{v ? `Решение: ${c.fix}` : c.hint}</div></div>
                          {canEdit ? <Seg value={v === true ? 'y' : v === false ? 'n' : '-'} onChange={(x) => run(() => hub.programUpdate(z.id, { checklist: { [c.id]: x === 'y' ? true : x === 'n' ? false : undefined } }))} options={[{ value: 'y', label: 'Да' }, { value: 'n', label: 'Нет' }, { value: '-', label: '?' }]} /> : <span className={`badge ${v ? 'red' : ''}`}>{v ? 'Подтверждена' : v === false ? 'Нет' : '—'}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {canEdit && (
                    <div className="row gap8 mt12">
                      <input className="input sm grow" placeholder="Что сделано (например, выкладка по планограмме, POS-материалы)" value={action} onChange={(e) => setAction(e.target.value)} />
                      <button className="btn sm" disabled={!action.trim() || busy} onClick={async () => { await run(() => hub.programUpdate(z.id, { action }), 'Действие записано'); setAction(''); }}>Записать</button>
                      {z.program.stage < 4 && <button className="btn primary sm" disabled={busy} onClick={() => run(() => hub.programUpdate(z.id, { advance: true }), 'Следующий этап')}>Этап {z.program.stage + 1} →</button>}
                    </div>
                  )}
                  <div className="col gap8 mt16">
                    {[...z.program.actions].reverse().map((a, i) => <div key={i} className="t-foot"><b>{a.text}</b><div className="ter t-cap">{a.by} · {fmtDateTime(a.t)}</div></div>)}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
        <div className="col gap16">
          {ra && (
            <Card title="Оценка целесообразности переноса">
              <div className={ra.current < ra.threshold ? 'error-box' : 'ok-box'}>Текущая точка: {money(ra.current)} за 30 дней при минимуме {money(ra.threshold)}</div>
              <div className="group-title" style={{ paddingLeft: 0 }}>Кандидаты (точки без морозильника)</div>
              <div className="list">
                {ra.candidates.map((c, i) => (
                  <div key={c.store.id} className="cell">
                    <span className="cell-icon" style={{ background: i === 0 ? 'var(--green)' : 'var(--gray)' }}>{c.score}</span>
                    <div className="cell-main"><div className="cell-title">{c.store.name}</div><div className="cell-sub">{c.reason} · {personName(c.store.repId)}</div></div>
                    {isMgr && <button className="btn sm" onClick={() => setMove(c.store.id)}>Перенести</button>}
                  </div>
                ))}
              </div>
              <div className="hint mt8">Балл = 55% потенциал + 30% категория точки + 15% близость. Решение остаётся за руководством.</div>
            </Card>
          )}
          <Card title="Последнее фото">{fcPhoto ? <Photo id={fcPhoto} /> : <div className="t-foot sec">Фото появится после визита представителя с проверкой оборудования</div>}<div className="t-foot sec mt8">Подтверждён на месте: {z.lastVerifiedAt ? fmtDay(z.lastVerifiedAt) : '—'}</div></Card>
          <Card title="История"><div className="col gap12">{[...z.history].reverse().map((h, i) => <div key={i} className="t-foot"><div>{h.text}</div><div className="t-cap ter">{fmtDateTime(h.t)}</div></div>)}</div></Card>
          {store && <Link to={`/app/stores/${store.id}`} className="btn block"><Icon name="store" size={16} />{store.name}</Link>}
        </div>
      </div>
      <Sheet open={statusS} onClose={() => setStatusS(false)} title="Статус оборудования">
        <div className="col gap8">
          {(['installed', 'missing', 'repair', 'replacement', 'warehouse', 'written_off'] as FreezerStatus[]).map((st) => (
            <button key={st} className={`btn lg block ${z.status === st ? 'primary' : ''}`} disabled={busy} onClick={async () => { const r = await run(() => hub.setFreezerStatus(z.id, st, note).then(() => true), 'Статус обновлён'); if (r) { setStatusS(false); setNote(''); } }}>{FREEZER_STATUS_LABEL[st]}</button>
          ))}
          <Field label="Комментарий"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: акт № 15, сервис «ХолодТехСервис»" /></Field>
          <div className="hint">Цикл: Установлен → Ремонт → Ожидает замены → Склад / Списание. Каждое изменение фиксируется в истории.</div>
        </div>
      </Sheet>
      <Sheet open={!!move} onClose={() => setMove(null)} title="Перенос морозильника">
        <div className="col gap16">
          <div className="t-sub">{store?.name} → <b>{storeName(move ?? '')}</b></div>
          <div className="info-box t-foot">Складу будет создана задача на перевозку (срок 72 ч). Программа по текущей точке закрывается, сигнал переноса — решён.</div>
          <Field label="Обоснование решения"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button className="btn primary lg block" disabled={busy || !note.trim()} onClick={async () => { const r = await run(() => hub.moveFreezer(z.id, move!, note).then(() => true), 'Решение принято, задача складу создана'); if (r) { setMove(null); setNote(''); } }}>Подтвердить перенос</button>
        </div>
      </Sheet>
    </>
  );
}
