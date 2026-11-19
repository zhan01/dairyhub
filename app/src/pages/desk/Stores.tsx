import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hub, personName } from '../../api/hub';
import { dayIndex, dropRatio, storePlan, storeRevenue, sumRange } from '../../domain/engine';
import { FREEZER_STATUS_LABEL } from '../../domain/types';
import { addDays, fmtDayShort, fmtTime } from '../../lib/date';
import { money, moneyShort, num, pct, signedPct } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Columns } from '../../ui/charts';
import { MapView } from '../../ui/MapView';
import { Card, Empty, Kpi, Seg, useAction, useHub } from '../../ui/kit';
import { BackLink, PageHead, SignalRow } from './common';
import { NewTaskSheet } from './Signals';

const WD = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function Stores() {
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [cat, setCat] = useState('');
  const T = dayIndex(ws, s.today);
  const issues = useMemo(() => {
    const m = new Map<string, 'high' | 'medium' | 'low'>();
    for (const x of Object.values(ws.signals)) if (x.storeId && (x.status === 'new' || x.status === 'in_progress')) { const p = m.get(x.storeId); if (!p || x.severity === 'high') m.set(x.storeId, x.severity); }
    return m;
  }, [ws, s.version]);
  const rows = useMemo(() => ws.stores
    .filter((x) => (!q || (x.name + x.address).toLowerCase().includes(q.toLowerCase())) && (!rep || x.repId === rep) && (!cat || x.category === cat))
    .map((x) => ({ x, d: dropRatio(storeRevenue(ws, x.id), T - 1), fz: ws.freezers.find((f) => f.storeId === x.id) })), [ws, q, rep, cat, T, s.version]);
  const reps = [...new Set(ws.stores.map((x) => x.repId))];
  const color = (id: string) => (issues.get(id) === 'high' ? '#ff3b30' : issues.get(id) === 'medium' ? '#ff9500' : '#34c759');

  return (
    <>
      <PageHead title="Торговые точки" sub={`${ws.stores.length} точек · закрепление за представителями, потенциал, оборудование и задолженность`} actions={<Seg value={view} onChange={setView} options={[{ value: 'list', label: 'Список' }, { value: 'map', label: 'Карта' }]} />} />
      <div className="row gap8 wrap" style={{ marginBottom: 16 }}>
        <div className="search"><Icon name="search" size={16} /><input placeholder="Название или адрес" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm" style={{ width: 'auto' }} value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Представитель"><option value="">Все представители</option>{reps.map((r) => <option key={r} value={r}>{personName(r)}</option>)}</select>
        <select className="input sm" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория"><option value="">Все категории</option><option value="A">Категория A</option><option value="B">Категория B</option><option value="C">Категория C</option></select>
      </div>
      {view === 'map' ? (
        <Card pad0>
          <MapView height={600} className="" points={rows.map(({ x }) => ({ id: x.id, lat: x.lat, lng: x.lng, color: color(x.id), label: x.category, popup: `<b>${x.name}</b><br/>${x.address}<br/>${personName(x.repId)}` }))} onSelect={(id) => nav(`/app/stores/${id}`)} />
          <div className="row gap16 t-foot sec" style={{ padding: 12 }}><span><span className="dot" style={{ background: '#34c759' }} /> норма</span><span><span className="dot" style={{ background: '#ff9500' }} /> есть сигнал</span><span><span className="dot" style={{ background: '#ff3b30' }} /> критично</span></div>
        </Card>
      ) : (
        <Card pad0>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Точка</th><th>Кат.</th><th className="hide-sm">Представитель</th><th className="hide-sm">Визиты</th><th className="r">Продажи 7 дн</th><th className="hide-sm">Оборудование</th><th className="r hide-sm">Долг</th><th></th></tr></thead>
              <tbody>
                {rows.map(({ x, d, fz }) => (
                  <tr key={x.id} className="click" onClick={() => nav(`/app/stores/${x.id}`)}>
                    <td><b>{x.name}</b><div className="t-cap sec">{x.address.replace('г. Алматы, ', '')}</div></td>
                    <td><span className="badge">{x.category}</span></td>
                    <td className="hide-sm">{personName(x.repId)}</td>
                    <td className="hide-sm sec">{x.visitDays.map((w) => WD[w]).join(', ')}</td>
                    <td className="r">{moneyShort(d.last7)} <span className={d.change >= 0 ? 'delta-up' : 'delta-down'} style={{ fontSize: 12 }}>{signedPct(d.change)}</span></td>
                    <td className="hide-sm">{fz ? <span className={`badge ${fz.status === 'installed' && !fz.fault ? 'green' : 'red'}`}>{fz.fault ? 'Темп.!' : FREEZER_STATUS_LABEL[fz.status]}</span> : <span className="ter">—</span>}</td>
                    <td className="r hide-sm">{x.debtOverdueDays ? <span className="c-red">{moneyShort(x.debt)}</span> : moneyShort(x.debt)}</td>
                    <td>{issues.has(x.id) && <span className="dot" style={{ background: color(x.id) }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

export function StoreDetail() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const st = ws.stores.find((x) => x.id === id);
  const isMgr = s.user!.role === 'manager' || s.user!.role === 'admin';
  const { run } = useAction();
  const [newTask, setNewTask] = useState(false);
  const T = dayIndex(ws, s.today);
  const data = useMemo(() => {
    if (!st) return null;
    const rev = storeRevenue(ws, st.id);
    const plan = storePlan(ws, st, s.today);
    const bySku = ws.skus.map((k) => ({ k, d: dropRatio(ws.sales[st.id][k.id], T - 1) })).filter((x) => x.d.base7 > 0 || x.d.last7 > 0);
    const visits = ws.visits.filter((v) => v.storeId === st.id && v.date <= s.today).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    const dels = ws.deliveries.filter((d) => d.storeId === st.id && d.plannedDate >= addDays(s.today, -14)).sort((a, b) => (a.plannedDate < b.plannedDate ? 1 : -1));
    const sigs = Object.values(ws.signals).filter((x) => x.storeId === st.id);
    return { rev: rev.slice(T - 35, T), plan, bySku, visits, dels, sigs, m30: sumRange(rev, T - 30, T - 1) };
  }, [st, ws, T, s.today, s.version]);
  if (!st || !data) return <Empty title="Точка не найдена" />;
  const fz = ws.freezers.filter((f) => f.storeId === st.id);
  const lastStock = data.visits.find((v) => v.stock)?.stock;
  return (
    <>
      <BackLink to="/app/stores" label="Торговые точки" />
      <PageHead title={st.name} sub={`${st.channel} · категория ${st.category} · ${st.address} · ${st.contact}`} actions={isMgr ? <button className="btn" onClick={() => setNewTask(true)}><Icon name="plus" size={16} />Задача</button> : undefined} />
      <div className="grid g4">
        <Kpi icon="tenge" label="Выручка 30 дней" value={moneyShort(data.m30)} />
        <Kpi icon="target" color="var(--green)" label="Прогноз к плану" value={pct(data.plan.forecast / Math.max(1, data.plan.realistic))} foot={`план ${moneyShort(data.plan.realistic)}`} />
        <Kpi icon="wallet" color={st.debtOverdueDays ? 'var(--red)' : 'var(--gray)'} label="Задолженность" value={moneyShort(st.debt)} foot={st.shipmentsBlocked ? <span className="delta-down">Отгрузки заблокированы · просрочка {st.debtOverdueDays} дн</span> : st.debtOverdueDays ? `просрочка ${st.debtOverdueDays} дн` : `лимит ${moneyShort(st.creditLimit)}`} />
        <Kpi icon="tenge" color={st.priceIndex > 1.1 ? 'var(--red)' : 'var(--indigo)'} label="Индекс цены к конкуренту" value={`${Math.round(st.priceIndex * 100)}%`} foot="порог 110%" />
      </div>
      <div className="grid g-2-1 mt16">
        <div className="col gap16">
          <Card title="Выручка по дням · 35 дней"><Columns values={data.rev} labels={data.rev.map((_, i) => fmtDayShort(addDays(s.today, i - 35)))} highlightFrom={28} /></Card>
          <Card title="Товары: 7 дней к средней неделе" pad0>
            <div className="table-wrap"><table className="t"><thead><tr><th>Товар</th><th className="r">7 дней, шт</th><th className="r">Средн. неделя</th><th className="r">Изм.</th><th className="r hide-sm">На полке</th></tr></thead>
              <tbody>{data.bySku.map(({ k, d }) => (
                <tr key={k.id}><td>{k.name}</td><td className="r">{num(d.last7)}</td><td className="r">{num(d.base7)}</td><td className={`r ${d.change <= -0.3 ? 'delta-down' : d.change >= 0.05 ? 'delta-up' : ''}`}>{signedPct(d.change)}</td><td className="r hide-sm">{lastStock?.[k.id] ? <span className={`badge ${lastStock[k.id] === 'ok' ? 'green' : lastStock[k.id] === 'low' ? 'orange' : 'red'}`}>{lastStock[k.id] === 'ok' ? 'есть' : lastStock[k.id] === 'low' ? 'мало' : 'нет'}</span> : '—'}</td></tr>
              ))}</tbody></table></div>
          </Card>
          <Card title="Последние визиты" pad0>
            {data.visits.map((v) => (
              <div key={v.id} className="cell">
                <span className="cell-icon" style={{ background: v.status === 'done' ? 'var(--green)' : v.status === 'missed' ? 'var(--red)' : 'var(--gray)' }}><Icon name={v.status === 'done' ? 'check' : v.status === 'missed' ? 'x' : 'clock'} size={16} /></span>
                <div className="cell-main"><div className="cell-title">{fmtDayShort(v.date)} · {personName(v.repId)}</div><div className="cell-sub">{v.checkIn ? `${fmtTime(v.checkIn.t)} · ${v.checkIn.distance} м от точки${v.checkOutAt ? ` · ${Math.round((v.checkOutAt - v.checkIn.t) / 60000)} мин` : ''}` : v.status === 'missed' ? 'Нет GPS-отметки' : 'Запланирован'}{v.comment ? ` · «${v.comment}»` : ''}</div></div>
                {v.orderTotal ? <b className="num t-foot">{money(v.orderTotal)}</b> : null}
              </div>
            ))}
          </Card>
        </div>
        <div className="col gap16">
          <Card pad0><MapView className="sm" points={[{ id: st.id, lat: st.lat, lng: st.lng, color: '#0a84ff', label: st.category }]} radius={{ lat: st.lat, lng: st.lng, m: ws.settings.geofenceM }} /><div className="t-foot sec" style={{ padding: '10px 16px' }}>Геозона визита {ws.settings.geofenceM} м</div></Card>
          <Card title="Закрепление">
            <div className="col gap8 t-foot">
              <div className="row between"><span className="sec">Представитель</span>{isMgr ? (
                <select className="input sm" style={{ width: 'auto' }} value={st.repId} onChange={(e) => run(() => hub.reassignStore(st.id, e.target.value), 'Точка передана')}>
                  {s.people.filter((p) => p.role === 'rep').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>) : <b>{personName(st.repId)}</b>}</div>
              <div className="row between"><span className="sec">Дни визитов</span><b>{st.visitDays.map((w) => WD[w]).join(', ')}</b></div>
            </div>
          </Card>
          <Card title="Оборудование" pad0>
            {fz.length === 0 ? <Empty icon="freezer" title="Морозильника нет" /> : fz.map((f) => (
              <Link key={f.id} to={`/app/equipment/${f.id}`} className="cell"><span className="cell-icon" style={{ background: f.status === 'installed' && !f.fault ? 'var(--teal)' : 'var(--red)' }}><Icon name="freezer" size={16} /></span><div className="cell-main"><div className="cell-title">{f.serial}</div><div className="cell-sub">{f.model} · {FREEZER_STATUS_LABEL[f.status]}{f.hasSensor ? ' · датчик' : ''}</div></div><Icon name="chevR" size={16} className="chev" /></Link>
            ))}
          </Card>
          <Card title="Поставки · 14 дней" pad0>
            {data.dels.map((d) => (
              <div key={d.id} className="cell"><div className="cell-main"><div className="cell-title">{fmtDayShort(d.plannedDate)}</div>{d.note && <div className="cell-sub">{d.note}</div>}</div><span className={`badge ${d.status === 'delivered' ? 'green' : d.status === 'planned' ? '' : 'red'}`}>{{ delivered: 'Доставлено', planned: 'План', delayed: 'Задержка', short: `Недогруз ${pct(d.fillRate)}`, blocked: 'Блок' }[d.status]}</span></div>
            ))}
          </Card>
          {data.sigs.length > 0 && <Card title="Сигналы" pad0>{data.sigs.map((x) => <SignalRow key={x.id} s={x} />)}</Card>}
        </div>
      </div>
      <NewTaskSheet open={newTask} onClose={() => setNewTask(false)} storeId={st.id} />
    </>
  );
}
