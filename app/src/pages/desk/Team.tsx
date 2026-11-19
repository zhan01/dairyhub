import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { personName } from '../../api/hub';
import { TIER_LABEL, aggregatePlan, bonusTier, dayIndex, dropRatio, revenueSeries, routeLoad, visitStats } from '../../domain/engine';
import { addDays, fmtDayShort, fmtTime } from '../../lib/date';
import { money, moneyShort, num1, pct, signedPct } from '../../lib/format';
import { LineChart, PlanRings, Sparkline } from '../../ui/charts';
import { Avatar, Card, Empty, Kpi, useHub } from '../../ui/kit';
import { BackLink, PageHead, SignalRow, storeName } from './common';
import { TeamLiveMap, TrackCard } from './Track';
import { exportTable } from '../../lib/exporter';
import { Icon } from '../../ui/Icon';

export function useRepRows() {
  const s = useHub();
  const ws = s.ws!;
  return useMemo(() => {
    const T = dayIndex(ws, s.today);
    return [...new Set(ws.stores.map((x) => x.repId))].map((rid) => {
      const stores = ws.stores.filter((x) => x.repId === rid);
      const rev = revenueSeries(ws, stores.map((x) => x.id));
      const d = dropRatio(rev, T - 1);
      const v = visitStats(ws.visits.filter((x) => x.repId === rid && x.date >= addDays(s.today, -7) && x.date < s.today));
      const plan = aggregatePlan(ws, stores, s.today);
      const load = routeLoad(ws, rid);
      const user = s.people.find((p) => p.id === rid);
      return { rid, name: user?.name ?? personName(rid), phone: user?.phone, stores: stores.length, d, v, plan, load, spark: rev.slice(T - 28, T) };
    });
  }, [ws, s.today, s.people, s.version]);
}

export function Team() {
  const rows = useRepRows();
  const nav = useNavigate();
  return (
    <>
      <PageHead title="Команда" sub="Объективная картина по каждому представителю: визиты, продажи, план и нагрузка маршрута" actions={<button className="btn" onClick={() => exportTable('dairyhub-komanda', ['Представитель', 'Точек', 'Визиты 7 дн, %', 'Пропуски', 'Ср. визит, мин', 'Продажи 7 дн, ₸', 'Изменение, %', 'Прогноз плана, %', 'Визитов в день'], rows.map((r) => [r.name, r.stores, Math.round(r.v.coverage * 100), r.v.missed, Math.round(r.v.avgDur), Math.round(r.d.last7), Math.round(r.d.change * 100), Math.round(r.plan.completion * 100), Math.round(r.load.perDay * 10) / 10]))}><Icon name="doc" size={16} />Экспорт в Excel</button>} />
      <TeamLiveMap />
      <Card pad0 className="mt16">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>Представитель</th><th className="r">Точек</th><th className="r">Визиты 7 дн</th><th className="r hide-sm">Пропуски</th><th className="r hide-sm">Ср. визит</th><th className="r">Продажи 7 дн</th><th className="hide-sm">Тренд 4 нед</th><th className="r">План</th><th className="r hide-sm">Нагрузка</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rid} className="click" onClick={() => nav(`/app/team/${r.rid}`)}>
                  <td><div className="row gap8"><Avatar name={r.name} size="sm" /><b>{r.name}</b></div></td>
                  <td className="r">{r.stores}</td>
                  <td className="r">{pct(r.v.coverage)}</td>
                  <td className="r hide-sm">{r.v.missed ? <span className="c-red bold">{r.v.missed}</span> : 0}</td>
                  <td className="r hide-sm">{Math.round(r.v.avgDur)} мин</td>
                  <td className="r">{moneyShort(r.d.last7)} <span className={r.d.change >= 0 ? 'delta-up' : 'delta-down'} style={{ fontSize: 12 }}>{signedPct(r.d.change)}</span></td>
                  <td className="hide-sm"><Sparkline values={r.spark} color={r.d.change <= -0.3 ? 'var(--red)' : 'var(--blue)'} /></td>
                  <td className="r"><span className={`badge ${r.plan.completion >= 1 ? 'green' : r.plan.completion >= 0.8 ? 'blue' : 'red'}`}>{pct(r.plan.completion)}</span></td>
                  <td className="r hide-sm">{num1(r.load.perDay)}/день</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="t-foot sec mt12">Продажи 7 дн — сравнение со средней неделей за предыдущие 4 недели. План — прогноз на конец месяца к реалистичному плану.</div>
    </>
  );
}

export function RepDetail() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const rows = useRepRows();
  const r = rows.find((x) => x.rid === id);
  const T = dayIndex(ws, s.today);
  const data = useMemo(() => {
    if (!r) return null;
    const stores = ws.stores.filter((x) => x.repId === r.rid);
    const rev = revenueSeries(ws, stores.map((x) => x.id));
    const labels = Array.from({ length: 28 }, (_, i) => fmtDayShort(addDays(s.today, i - 28)));
    const visits = ws.visits.filter((v) => v.repId === r.rid && v.date >= addDays(s.today, -6)).sort((a, b) => (a.date === b.date ? (a.checkIn?.t ?? 0) - (b.checkIn?.t ?? 0) : a.date < b.date ? 1 : -1));
    const sigs = Object.values(ws.signals).filter((x) => x.repId === r.rid && x.status !== 'resolved' && x.status !== 'dismissed');
    return { stores, cur: rev.slice(T - 28, T), prev: rev.slice(T - 56, T - 28), labels, visits, sigs };
  }, [r, ws, T, s.today]);
  if (!r || !data) return <Empty title="Сотрудник не найден" />;
  const tier = bonusTier(r.plan.completion);
  return (
    <>
      <BackLink to="/app/team" label="Команда" />
      <div className="page-h">
        <div className="row gap16"><Avatar name={r.name} size="lg" /><div><h1 className="t-title1" style={{ margin: 0 }}>{r.name}</h1><div className="t-sub sec">Торговый представитель · {r.stores} точек · {r.phone}</div></div></div>
      </div>
      <div className="grid g4">
        <Kpi icon="tenge" label="Продажи 7 дней" value={moneyShort(r.d.last7)} foot={<><span className={r.d.change >= 0 ? 'delta-up' : 'delta-down'}>{signedPct(r.d.change)}</span> к средней неделе</>} />
        <Kpi icon="location" color="var(--indigo)" label="Выполнение визитов" value={pct(r.v.coverage)} foot={`${r.v.done} из ${r.v.planned} · коротких ${r.v.short}`} />
        <Kpi icon="clock" color="var(--teal)" label="Средняя длительность" value={`${Math.round(r.v.avgDur)} мин`} foot={`вне геозоны: ${r.v.outZone}`} />
        <Kpi icon="route" color="var(--orange)" label="Нагрузка маршрута" value={`${num1(r.load.perDay)}/день`} foot={`~${Math.round(r.load.kmPerDay)} км в день`} />
      </div>
      <div className="grid g-2-1 mt16">
        <Card title="Продажи: 4 недели к предыдущим 4">
          <LineChart labels={data.labels} series={[{ name: 'Последние 28 дней', values: data.cur, color: 'var(--blue)', area: true }, { name: 'Предыдущие 28 дней', values: data.prev, color: 'var(--label-3)', dashed: true }]} />
        </Card>
        <Card title="План и премия">
          <div className="row gap16"><PlanRings value={r.plan.completion} size={120} /><div><div className="t-title1">{pct(r.plan.completion)}</div><div className="t-foot sec">прогноз к реалистичному плану</div><span className={`badge ${tier ? 'green' : ''} mt8`}>{TIER_LABEL[tier]}</span></div></div>
          <div className="col gap8 t-foot mt16">
            <div className="row between"><span className="sec">Реалистичный план</span><b>{money(r.plan.realistic)}</b></div>
            <div className="row between"><span className="sec">Прогноз</span><b>{money(r.plan.forecast)}</b></div>
            <div className="row between"><span className="sec">Скорректированное выполнение</span><b className="c-green">{pct(r.plan.adjusted)}</b></div>
          </div>
          <div className="hint mt8">Скорректированное выполнение не учитывает потери из-за задержек поставок и блокировок отгрузок — то, что не зависит от сотрудника.</div>
        </Card>
      </div>
      <div className="mt16"><TrackCard repId={r.rid} /></div>
      {data.sigs.length > 0 && <Card title="Активные сигналы" pad0 className="mt16">{data.sigs.map((x) => <SignalRow key={x.id} s={x} />)}</Card>}
      <Card title="Визиты за 7 дней (GPS)" pad0 className="mt16">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Дата</th><th>Точка</th><th>Статус</th><th className="r">Отметка</th><th className="r hide-sm">Длительность</th><th className="r hide-sm">Расстояние</th><th className="hide-sm">Отметки</th></tr></thead>
            <tbody>
              {data.visits.map((v) => (
                <tr key={v.id}>
                  <td>{fmtDayShort(v.date)}</td>
                  <td><Link to={`/app/stores/${v.storeId}`}>{storeName(v.storeId)}</Link></td>
                  <td><span className={`badge ${v.status === 'done' ? 'green' : v.status === 'missed' ? 'red' : v.status === 'in_progress' ? 'blue' : ''}`}>{v.status === 'done' ? 'Выполнен' : v.status === 'missed' ? 'Пропущен' : v.status === 'in_progress' ? 'Идёт' : 'По плану'}</span></td>
                  <td className="r">{v.checkIn ? fmtTime(v.checkIn.t) : '—'}</td>
                  <td className="r hide-sm">{v.checkIn && v.checkOutAt ? `${Math.round((v.checkOutAt - v.checkIn.t) / 60000)} мин` : '—'}</td>
                  <td className="r hide-sm">{v.checkIn ? `${v.checkIn.distance} м` : '—'}</td>
                  <td className="hide-sm">{v.flags.map((f) => <span key={f} className="badge orange" style={{ marginRight: 4 }}>{f}</span>)}{!v.reportDone && v.status === 'done' && <span className="badge red">Нет отчёта</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
