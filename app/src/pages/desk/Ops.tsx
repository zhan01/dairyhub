import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { personName } from '../../api/hub';
import { addDays, fmtDayShort } from '../../lib/date';
import { money, moneyShort, pct } from '../../lib/format';
import { Card, Kpi, Seg, useHub } from '../../ui/kit';
import { PageHead, storeName } from './common';

const DS: Record<string, [string, string]> = { delivered: ['Доставлено', 'green'], planned: ['Запланировано', ''], delayed: ['Задержка', 'red'], short: ['Недогруз', 'orange'], blocked: ['Заблокировано', 'red'] };

export function Deliveries() {
  const s = useHub();
  const ws = s.ws!;
  const [f, setF] = useState<'problem' | 'all' | 'planned'>('problem');
  const list = useMemo(() => ws.deliveries
    .filter((d) => d.plannedDate >= addDays(s.today, -14))
    .filter((d) => (f === 'problem' ? ['delayed', 'short', 'blocked'].includes(d.status) : f === 'planned' ? d.status === 'planned' : true))
    .sort((a, b) => (a.plannedDate < b.plannedDate ? 1 : -1)), [ws, f, s.today, s.version]);
  const last14 = ws.deliveries.filter((d) => d.plannedDate >= addDays(s.today, -14) && d.plannedDate < s.today);
  const onTime = last14.filter((d) => d.status === 'delivered').length;
  const fill = last14.reduce((a, d) => a + d.fillRate, 0) / Math.max(1, last14.length);
  return (
    <>
      <PageHead title="Поставки" sub="Данные учётной системы (1С) · задержки и недогрузы автоматически связываются с падением продаж" />
      <div className="grid g4">
        <Kpi icon="truck" label="Поставок за 14 дней" value={String(last14.length)} />
        <Kpi icon="clock" color="var(--green)" label="Вовремя и полностью" value={pct(onTime / Math.max(1, last14.length))} />
        <Kpi icon="box" color="var(--orange)" label="Средний уровень исполнения" value={pct(fill)} />
        <Kpi icon="alert" color="var(--red)" label="Проблемных" value={String(last14.length - onTime)} />
      </div>
      <div className="mt16" style={{ marginBottom: 12 }}><Seg value={f} onChange={setF} options={[{ value: 'problem', label: 'Проблемные' }, { value: 'planned', label: 'Запланированные' }, { value: 'all', label: 'Все' }]} /></div>
      <Card pad0><div className="table-wrap"><table className="t"><thead><tr><th>Дата</th><th>Точка</th><th>Статус</th><th className="r">Исполнение</th><th className="hide-sm">Комментарий</th></tr></thead>
        <tbody>{list.map((d) => <tr key={d.id}><td>{fmtDayShort(d.plannedDate)}{d.actualDate && d.actualDate !== d.plannedDate ? <span className="c-red"> → {fmtDayShort(d.actualDate)}</span> : ''}</td><td>{storeName(d.storeId)}</td><td><span className={`badge ${DS[d.status][1]}`}>{DS[d.status][0]}</span></td><td className="r">{d.status === 'planned' ? '—' : pct(d.fillRate)}</td><td className="hide-sm sec">{d.note ?? ''}</td></tr>)}</tbody></table></div></Card>
    </>
  );
}

export function Debts() {
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const rows = [...ws.stores].sort((a, b) => b.debtOverdueDays - a.debtOverdueDays || b.debt / b.creditLimit - a.debt / a.creditLimit);
  const overdue = ws.stores.filter((x) => x.debtOverdueDays > 0);
  return (
    <>
      <PageHead title="Дебиторская задолженность" sub="Блокировки отгрузок из-за долга — одна из причин падения продаж, которую видит DairyHub" />
      <div className="grid g4">
        <Kpi icon="wallet" label="Общая задолженность" value={moneyShort(ws.stores.reduce((a, b) => a + b.debt, 0))} />
        <Kpi icon="clock" color="var(--orange)" label="С просрочкой" value={String(overdue.length)} foot={moneyShort(overdue.reduce((a, b) => a + b.debt, 0))} />
        <Kpi icon="lock" color="var(--red)" label="Отгрузки заблокированы" value={String(ws.stores.filter((x) => x.shipmentsBlocked).length)} />
        <Kpi icon="tenge" color="var(--indigo)" label="Сверх кредитного лимита" value={String(ws.stores.filter((x) => x.debt > x.creditLimit).length)} />
      </div>
      <Card pad0 className="mt16"><div className="table-wrap"><table className="t"><thead><tr><th>Точка</th><th className="hide-sm">Представитель</th><th className="r">Долг</th><th className="r">Лимит</th><th className="r">Просрочка</th><th>Статус</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.id} className="click" onClick={() => nav(`/app/stores/${x.id}`)}><td>{x.name}</td><td className="hide-sm">{personName(x.repId)}</td><td className="r">{money(x.debt)}</td><td className="r sec">{money(x.creditLimit)}</td><td className={`r ${x.debtOverdueDays > 30 ? 'delta-down' : ''}`}>{x.debtOverdueDays ? `${x.debtOverdueDays} дн` : '—'}</td><td>{x.shipmentsBlocked ? <span className="badge red">Стоп-отгрузка</span> : x.debtOverdueDays ? <span className="badge orange">Просрочка</span> : <span className="badge green">Норма</span>}</td></tr>)}</tbody></table></div></Card>
    </>
  );
}
