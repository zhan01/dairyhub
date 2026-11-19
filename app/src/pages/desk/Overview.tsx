import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { personName } from '../../api/hub';
import { aggregatePlan, dayIndex, revenueSeries, sumRange, visitStats } from '../../domain/engine';
import { DEPT_LABEL, type Dept } from '../../domain/types';
import { addDays, fmtDay, fmtDayShort, fmtWeekdayLong } from '../../lib/date';
import { money, moneyShort, pct, signedPct } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { LineChart, PlanRings } from '../../ui/charts';
import { Bar, Card, Empty, Kpi, Seg, useHub } from '../../ui/kit';
import { PageHead, SignalRow, TaskLine, storeName } from './common';
import { TaskSheet } from './Tasks';

export function Overview() {
  const s = useHub();
  const role = s.user!.role;
  if (role === 'warehouse' || role === 'accounting') return <DeptOverview dept={role} />;
  return <ManagerOverview />;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

function ManagerOverview() {
  const s = useHub();
  const ws = s.ws!;
  const today = s.today;
  const nav = useNavigate();
  const [range, setRange] = useState<'30' | '60'>('30');
  const [task, setTask] = useState<string | null>(null);

  const d = useMemo(() => {
    const plan = aggregatePlan(ws, ws.stores, today);
    const T = dayIndex(ws, today);
    const rev = revenueSeries(ws, ws.stores.map((x) => x.id));
    const n = Number(range);
    const cur = rev.slice(T - n, T);
    const prev = rev.slice(T - 2 * n, T - n);
    const labels = Array.from({ length: n }, (_, i) => fmtDayShort(addDays(today, i - n)));
    const sumCur = sumRange(rev, T - 7, T - 1);
    const sumPrev = sumRange(rev, T - 14, T - 8);
    const vToday = visitStats(ws.visits.filter((v) => v.date === today));
    const v7 = visitStats(ws.visits.filter((v) => v.date >= addDays(today, -7) && v.date < today));
    const sig = Object.values(ws.signals).filter((x) => x.status === 'new' || x.status === 'in_progress' || x.status === 'monitoring');
    const open = sig.filter((x) => x.status !== 'monitoring').sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity] || b.detectedAt - a.detectedAt);
    const tasks = ws.tasks.filter((t) => t.status !== 'done');
    const overdue = tasks.filter((t) => t.dueAt < Date.now());
    const depts: Dept[] = ['warehouse', 'accounting', 'manager', 'rep'];
    const deptStats = depts.map((dp) => {
      const all = ws.tasks.filter((t) => t.dept === dp);
      const done = all.filter((t) => t.status === 'done').length;
      return { dp, all: all.length, open: all.length - done, overdue: all.filter((t) => t.status !== 'done' && t.dueAt < Date.now()).length };
    });
    return { plan, cur, prev, labels, sumCur, sumPrev, vToday, v7, open, monitoring: sig.filter((x) => x.status === 'monitoring').length, tasks, overdue, deptStats };
  }, [ws, today, range, s.version]);

  return (
    <>
      <PageHead title={`${greeting()}, ${s.user!.name.split(' ')[0]}`} sub={`${fmtWeekdayLong(today)[0].toUpperCase() + fmtWeekdayLong(today).slice(1)}, ${fmtDay(today)} · сводка по команде`} actions={<Link className="btn primary" to="/app/signals"><Icon name="bolt" size={16} />Сигналы: {d.open.length}</Link>} />

      <div className="grid g4">
        <Kpi icon="target" color="var(--green)" label="Прогноз выполнения плана" value={pct(d.plan.completion)} foot={<>к реалистичному плану · к плану «сверху» {pct(d.plan.completionTopDown)}</>} />
        <Kpi icon="tenge" label="Продажи за 7 дней" value={moneyShort(d.sumCur)} foot={<><span className={d.sumCur >= d.sumPrev ? 'delta-up' : 'delta-down'}>{signedPct(d.sumCur / Math.max(1, d.sumPrev) - 1)}</span> к прошлой неделе</>} />
        <Kpi icon="location" color="var(--indigo)" label="Визиты сегодня" value={`${d.vToday.done} / ${d.vToday.planned}`} foot={<>за 7 дней выполнено {pct(d.v7.coverage)} · пропущено {d.v7.missed}</>} />
        <Kpi icon="checklist" color={d.overdue.length ? 'var(--red)' : 'var(--orange)'} label="Задачи подразделений" value={String(d.tasks.length)} foot={<>{d.overdue.length ? <span className="delta-down">{d.overdue.length} просрочено</span> : 'без просрочек'} · на контроле {d.monitoring}</>} />
      </div>

      <div className="grid g-2-1 mt16">
        <Card title="Продажи компании" action={<Seg value={range} onChange={setRange} options={[{ value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} />}>
          <LineChart labels={d.labels} series={[{ name: 'Текущий период', values: d.cur, color: 'var(--blue)', area: true }, { name: 'Предыдущий период', values: d.prev, color: 'var(--label-3)', dashed: true }]} />
        </Card>
        <Card title="План месяца" action={<Link to="/app/plans" className="t-foot">Подробнее</Link>}>
          <div className="row gap20" style={{ alignItems: 'center' }}>
            <PlanRings value={d.plan.completion} size={140} />
            <div className="col gap8 t-foot">
              <div><span className="dot" style={{ background: '#0a84ff' }} /> 80% · уровень 1</div>
              <div><span className="dot" style={{ background: '#34c759' }} /> 100% · уровень 2</div>
              <div><span className="dot" style={{ background: '#ff2d55' }} /> 120% · уровень 3</div>
            </div>
          </div>
          <div className="col gap8 mt16 t-foot">
            <div className="row between"><span className="sec">Реалистичный план</span><b className="num">{money(d.plan.realistic)}</b></div>
            <div className="row between"><span className="sec">Факт с начала месяца</span><b className="num">{money(d.plan.fact)}</b></div>
            <div className="row between"><span className="sec">Прогноз на конец месяца</span><b className="num">{money(d.plan.forecast)}</b></div>
            <div className="row between"><span className="sec">С учётом внешних причин</span><b className="num c-green">{pct(d.plan.adjusted)}</b></div>
          </div>
        </Card>
      </div>

      <div className="grid g-2-1 mt16">
        <Card title="Требуют внимания" pad0 action={<Link to="/app/signals" className="t-foot">Все сигналы</Link>}>
          {d.open.length === 0 ? <Empty title="Отклонений нет" text="DairyHub продолжает мониторинг" /> : d.open.slice(0, 6).map((x) => <SignalRow key={x.id} s={x} />)}
        </Card>
        <div className="col gap16">
          <Card title="Контроль подразделений">
            <div className="col gap16">
              {d.deptStats.map((x) => (
                <div key={x.dp}>
                  <div className="row between t-foot"><b>{DEPT_LABEL[x.dp]}</b><span className="sec">{x.open} в работе{x.overdue ? <span className="c-red"> · {x.overdue} просрочено</span> : ''}</span></div>
                  <div className="mt4"><Bar value={x.all ? (x.all - x.open) / x.all : 0} color={x.overdue ? 'var(--orange)' : 'var(--green)'} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Срочные задачи" pad0>
            {d.tasks.length === 0 ? <Empty title="Нет открытых задач" /> : <div>{d.tasks.sort((a, b) => a.dueAt - b.dueAt).slice(0, 4).map((t) => <TaskLine key={t.id} t={t} onClick={() => setTask(t.id)} />)}</div>}
          </Card>
        </div>
      </div>

      <Card title="Команда сегодня" className="mt16" pad0 action={<Link to="/app/team" className="t-foot">Команда</Link>}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Представитель</th><th className="r">Визиты</th><th className="r hide-sm">Последняя отметка</th><th className="r">Прогноз плана</th></tr></thead>
            <tbody>
              {[...new Set(ws.stores.map((x) => x.repId))].map((rid) => {
                const vs = ws.visits.filter((v) => v.repId === rid && v.date === today);
                const st = visitStats(vs);
                const last = vs.filter((v) => v.checkIn).sort((a, b) => b.checkIn!.t - a.checkIn!.t)[0];
                const p = aggregatePlan(ws, ws.stores.filter((x) => x.repId === rid), today);
                return (
                  <tr key={rid} className="click" onClick={() => nav(`/app/team/${rid}`)}>
                    <td><b>{personName(rid)}</b></td>
                    <td className="r">{st.done} / {st.planned}</td>
                    <td className="r hide-sm sec">{last ? `${storeName(last.storeId)}` : '—'}</td>
                    <td className="r"><span className={`badge ${p.completion >= 1 ? 'green' : p.completion >= 0.8 ? 'blue' : 'red'}`}>{pct(p.completion)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}

function DeptOverview({ dept }: { dept: 'warehouse' | 'accounting' }) {
  const s = useHub();
  const ws = s.ws!;
  const [task, setTask] = useState<string | null>(null);
  const tasks = ws.tasks.filter((t) => t.dept === dept);
  const open = tasks.filter((t) => t.status !== 'done').sort((a, b) => a.dueAt - b.dueAt);
  const overdue = open.filter((t) => t.dueAt < Date.now());
  const done = tasks.filter((t) => t.status === 'done');
  const sigs = Object.values(ws.signals).filter((x) => (x.status === 'in_progress' || x.status === 'new') && x.hypotheses.some((h) => h.dept === dept));
  const extra = dept === 'warehouse'
    ? { label: 'Проблемные поставки за 10 дней', value: ws.deliveries.filter((x) => ['delayed', 'short', 'blocked'].includes(x.status) && x.plannedDate >= addDays(s.today, -10)).length, link: '/app/deliveries', icon: 'truck' }
    : { label: 'Просроченная дебиторка', value: moneyShort(ws.stores.filter((x) => x.debtOverdueDays > 0).reduce((a, b) => a + b.debt, 0)), link: '/app/debts', icon: 'wallet' };
  return (
    <>
      <PageHead title={`${greeting()}, ${s.user!.name.split(' ')[0]}`} sub={`${DEPT_LABEL[dept]} · задачи, которые DairyHub направил вашему подразделению`} />
      <div className="grid g4">
        <Kpi icon="checklist" label="Открытые задачи" value={String(open.length)} />
        <Kpi icon="clock" color="var(--red)" label="Просрочено по SLA" value={String(overdue.length)} foot={`SLA: ${dept === 'warehouse' ? '24 ч' : '48 ч'}`} />
        <Kpi icon="check" color="var(--green)" label="Выполнено" value={String(done.length)} />
        <Link to={extra.link} style={{ color: 'inherit' }}><Kpi icon={extra.icon} color="var(--orange)" label={extra.label} value={String(extra.value)} /></Link>
      </div>
      <div className="grid g-2-1 mt16">
        <Card title="Мои задачи" pad0>
          {open.length === 0 ? <Empty title="Все задачи выполнены" /> : open.map((t) => <TaskLine key={t.id} t={t} onClick={() => setTask(t.id)} />)}
        </Card>
        <Card title="Почему эти задачи появились" pad0>
          {sigs.length === 0 ? <Empty title="Нет связанных сигналов" /> : sigs.map((x) => <SignalRow key={x.id} s={x} />)}
        </Card>
      </div>
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}
