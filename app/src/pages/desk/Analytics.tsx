import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { personName } from '../../api/hub';
import { dayIndex, revenueSeries, storeRevenue, sumRange, visitStats } from '../../domain/engine';
import { addDays, fmtDayShort, fmtWeekday } from '../../lib/date';
import { moneyShort, num, pct, signedPct } from '../../lib/format';
import { Columns, HBar, LineChart } from '../../ui/charts';
import { Card, Kpi, Seg, useHub } from '../../ui/kit';
import { PageHead } from './common';
import { exportTable } from '../../lib/exporter';
import { Icon } from '../../ui/Icon';

type P = 'day' | 'week' | 'month';
const LEN: Record<P, number> = { day: 1, week: 7, month: 28 };
const LBL: Record<P, [string, string]> = { day: ['Вчера', 'Позавчера'], week: ['Последние 7 дней', 'Предыдущие 7 дней'], month: ['Последние 4 недели', 'Предыдущие 4 недели'] };

export function Analytics() {
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const [p, setP] = useState<P>('week');
  const [rep, setRep] = useState('');
  const T = dayIndex(ws, s.today);
  const d = useMemo(() => {
    const n = LEN[p];
    const stores = ws.stores.filter((x) => !rep || x.repId === rep);
    const ids = stores.map((x) => x.id);
    const total = revenueSeries(ws, ids);
    const cur = sumRange(total, T - n, T - 1);
    const prev = sumRange(total, T - 2 * n, T - n - 1);
    const units = (skuId: string, a: number, b: number) => ids.reduce((acc, id) => acc + sumRange(ws.sales[id][skuId], a, b), 0);
    const skus = ws.skus.map((k) => {
      const c = units(k.id, T - n, T - 1);
      const pv = units(k.id, T - 2 * n, T - n - 1);
      return { k, c, pv, ch: pv ? c / pv - 1 : 0, rev: c * k.price };
    });
    const repIds = [...new Set(ws.stores.map((x) => x.repId))];
    const byRep = repIds.map((r) => {
      const ser = revenueSeries(ws, ws.stores.filter((x) => x.repId === r).map((x) => x.id));
      const c = sumRange(ser, T - n, T - 1);
      const pv = sumRange(ser, T - 2 * n, T - n - 1);
      return { r, c, ch: pv ? c / pv - 1 : 0 };
    }).sort((a, b) => b.c - a.c);
    const byStore = stores.map((x) => {
      const ser = storeRevenue(ws, x.id);
      const c = sumRange(ser, T - n, T - 1);
      const pv = sumRange(ser, T - 2 * n, T - n - 1);
      return { x, c, ch: pv ? c / pv - 1 : 0 };
    });
    const cats = (['A', 'B', 'C'] as const).map((c) => ({ label: `Категория ${c}`, value: byStore.filter((b) => b.x.category === c).reduce((a, b) => a + b.c, 0) }));
    const weeks = Array.from({ length: 12 }, (_, i) => sumRange(total, T - 84 + i * 7, T - 78 + i * 7));
    const weekLabels = weeks.map((_, i) => fmtDayShort(addDays(s.today, -84 + i * 7)));
    const vDays = Array.from({ length: 14 }, (_, i) => addDays(s.today, i - 14));
    const coverage = vDays.map((dd) => visitStats(ws.visits.filter((v) => v.date === dd && (!rep || v.repId === rep))).coverage);
    const frozen = skus.filter((x) => x.k.frozen).reduce((a, b) => a + b.rev, 0);
    return { cur, prev, skus, byRep, byStore, cats, weeks, weekLabels, vDays, coverage, frozen, daily: total.slice(T - 28, T) };
  }, [ws, p, rep, T, s.today, s.version]);
  const decl = [...d.byStore].sort((a, b) => a.ch - b.ch).slice(0, 6);
  const grow = [...d.byStore].sort((a, b) => b.ch - a.ch).slice(0, 6);

  return (
    <>
      <PageHead title="Аналитика продаж" sub="Сравнение по дням, неделям и месяцам · по сотрудникам, магазинам и товарам" actions={
        <>
          <select className="input sm" style={{ width: 'auto' }} value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Представитель"><option value="">Вся команда</option>{[...new Set(ws.stores.map((x) => x.repId))].map((r) => <option key={r} value={r}>{personName(r)}</option>)}</select>
          <Seg value={p} onChange={setP} options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
        </>
      } />
      <div className="grid g4">
        <Kpi icon="tenge" label={LBL[p][0]} value={moneyShort(d.cur)} foot={<><span className={d.cur >= d.prev ? 'delta-up' : 'delta-down'}>{signedPct(d.cur / Math.max(1, d.prev) - 1)}</span> · {LBL[p][1].toLowerCase()} {moneyShort(d.prev)}</>} />
        <Kpi icon="store" color="var(--indigo)" label="Средняя выручка точки" value={moneyShort(d.cur / Math.max(1, d.byStore.length))} foot={`${d.byStore.length} точек`} />
        <Kpi icon="snow" color="var(--teal)" label="Доля мороженого" value={pct(d.frozen / Math.max(1, d.cur))} foot="продажи через морозильники" />
        <Kpi icon="trendDown" color="var(--red)" label="Точек с падением > 30%" value={String(d.byStore.filter((x) => x.ch <= -0.3).length)} foot="к предыдущему периоду" />
      </div>
      <div className="grid g-2-1 mt16">
        <Card title="Динамика по неделям · 12 недель"><LineChart labels={d.weekLabels} series={[{ name: 'Выручка за неделю', values: d.weeks, color: 'var(--blue)', area: true }]} height={220} /></Card>
        <Card title="Выручка по категориям точек"><HBar items={d.cats.map((c, i) => ({ ...c, color: ['var(--blue)', 'var(--indigo)', 'var(--teal)'][i] }))} /><div className="hint mt12">A — супермаркеты, B — минимаркеты, C — магазины у дома</div></Card>
      </div>
      <div className="grid g2 mt16">
        <Card title="По сотрудникам"><HBar items={d.byRep.map((r) => ({ label: personName(r.r), value: r.c, sub: signedPct(r.ch), color: r.ch <= -0.3 ? 'var(--red)' : 'var(--blue)' }))} /></Card>
        <Card title="Выполнение визитов · 14 дней">
          <Columns values={d.coverage.map((c) => c * 100)} labels={d.vDays.map((x) => `${fmtWeekday(x)} ${fmtDayShort(x)}`)} color="var(--green)" format={(n) => `${Math.round(n)}%`} height={180} />
        </Card>
      </div>
      <Card title="По товарам" pad0 className="mt16" action={<button className="btn sm" style={{ marginRight: 20 }} onClick={() => exportTable(`dairyhub-tovary-${p}`, ['Товар', `${LBL[p][0]}, шт`, `${LBL[p][1]}, шт`, 'Изменение, %', 'Выручка, ₸'], d.skus.map((x) => [x.k.name, x.c, x.pv, Math.round(x.ch * 100), Math.round(x.rev)]))}><Icon name="doc" size={14} />Excel</button>}>
        <div className="table-wrap"><table className="t"><thead><tr><th>Товар</th><th className="r">{LBL[p][0]}, шт</th><th className="r">{LBL[p][1]}, шт</th><th className="r">Изменение</th><th className="r">Выручка</th></tr></thead>
          <tbody>{d.skus.map((x) => <tr key={x.k.id}><td>{x.k.name}</td><td className="r">{num(x.c)}</td><td className="r">{num(x.pv)}</td><td className={`r ${x.ch <= -0.1 ? 'delta-down' : x.ch >= 0.05 ? 'delta-up' : ''}`}>{signedPct(x.ch)}</td><td className="r">{moneyShort(x.rev)}</td></tr>)}</tbody></table></div>
      </Card>
      <div className="grid g2 mt16">
        <Card title="Наибольшее снижение" pad0>{decl.map((x) => <button key={x.x.id} className="cell" onClick={() => nav(`/app/stores/${x.x.id}`)}><div className="cell-main"><div className="cell-title">{x.x.name}</div><div className="cell-sub">{personName(x.x.repId)}</div></div><b className="delta-down num">{signedPct(x.ch)}</b></button>)}</Card>
        <Card title="Наибольший рост" pad0>{grow.map((x) => <button key={x.x.id} className="cell" onClick={() => nav(`/app/stores/${x.x.id}`)}><div className="cell-main"><div className="cell-title">{x.x.name}</div><div className="cell-sub">{personName(x.x.repId)}</div></div><b className="delta-up num">{signedPct(x.ch)}</b></button>)}</Card>
      </div>
    </>
  );
}
