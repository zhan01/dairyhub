import { useMemo, useState } from 'react';
import { personName } from '../../api/hub';
import { LOSS_LABEL, TIER_LABEL, aggregatePlan, bonusTier, lossBreakdown, storePlan } from '../../domain/engine';
import { CATEGORY_COEF } from '../../domain/catalog';
import { monthName } from '../../lib/date';
import { money, moneyShort, pct } from '../../lib/format';
import { HBar, PlanRings } from '../../ui/charts';
import { Bar, Card, Kpi, Seg, useHub } from '../../ui/kit';
import { PageHead } from './common';

export function Plans() {
  const s = useHub();
  const ws = s.ws!;
  const [mode, setMode] = useState<'rep' | 'store'>('rep');
  const d = useMemo(() => {
    const all = aggregatePlan(ws, ws.stores, s.today);
    const reps = [...new Set(ws.stores.map((x) => x.repId))].map((r) => ({ r, p: aggregatePlan(ws, ws.stores.filter((x) => x.repId === r), s.today) })).sort((a, b) => b.p.completion - a.p.completion);
    const stores = ws.stores.map((x) => ({ x, p: storePlan(ws, x, s.today) })).sort((a, b) => a.p.forecast / a.p.realistic - b.p.forecast / b.p.realistic);
    const loss = lossBreakdown(ws, ws.stores, s.today);
    return { all, reps, stores, loss };
  }, [ws, s.today, s.version]);
  const lossItems = Object.entries(d.loss).filter(([, v]) => v > 0).map(([k, v]) => ({ label: LOSS_LABEL[k], value: v, color: k === 'delivery' ? 'var(--teal)' : k === 'debt' ? 'var(--purple)' : k === 'visits' ? 'var(--orange)' : 'var(--gray)' }));

  return (
    <>
      <PageHead title="Планы и премии" sub={`${monthName(s.today)} · реалистичное планирование по каждой точке и выявление причин невыполнения`} />
      <div className="grid g4">
        <Kpi icon="target" color="var(--red)" label="К плану «сверху»" value={pct(d.all.completionTopDown)} foot={`план ${moneyShort(d.all.topDown)} — ×${ws.settings.topDownPlanFactor} к факту, без учёта потенциала`} />
        <Kpi icon="target" color="var(--green)" label="К реалистичному плану" value={pct(d.all.completion)} foot={`план ${moneyShort(d.all.realistic)}`} />
        <Kpi icon="tenge" label="Факт с начала месяца" value={moneyShort(d.all.fact)} foot={`${d.all.elapsed} из ${d.all.days} дней`} />
        <Kpi icon="shield" color="var(--indigo)" label="Скорректированное выполнение" value={pct(d.all.adjusted)} foot="без потерь по вине поставок и блокировок" />
      </div>
      <div className="grid g-2-1 mt16">
        <Card title="Как DairyHub считает реалистичный план">
          <div className="info-box t-sub" style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>План точки = средние продажи за 3 месяца × сезонность ({ws.settings.seasonality.toFixed(2)}) × коэффициент потенциала</div>
          <div className="grid g3 mt12">
            {(['A', 'B', 'C'] as const).map((c) => <div key={c} className="card" style={{ background: 'var(--bg)', padding: 14 }}><div className="t-cap sec">Категория {c}</div><div className="t-title2">×{CATEGORY_COEF[c].toFixed(2).replace('.', ',')}</div><div className="t-cap sec">{c === 'A' ? 'супермаркеты, высокий трафик' : c === 'B' ? 'минимаркеты' : 'магазины у дома'}</div></div>)}
          </div>
          <div className="t-foot sec mt12">План, спущенный «сверху» без учёта потенциала точек, исторически выполняется примерно наполовину. Реалистичный план опирается на фактические данные каждой точки, поэтому его выполнение — объективная мера работы. Коэффициенты и сезонность настраиваются руководителем.</div>
        </Card>
        <Card title="Система премирования">
          <div className="row gap16"><PlanRings value={d.all.completion} size={110} /><div className="col gap8 t-foot">
            {[80, 100, 120].map((t) => <div key={t} className="row gap8"><span className="dot" style={{ background: t === 80 ? '#0a84ff' : t === 100 ? '#34c759' : '#ff2d55' }} /><span>{TIER_LABEL[t]}</span></div>)}
          </div></div>
          <div className="hint mt12">Размер премии на каждом уровне устанавливает компания. DairyHub рассчитывает уровень по скорректированному выполнению — сотрудник не теряет премию из-за задержек склада или блокировки отгрузок.</div>
        </Card>
      </div>
      <div className="grid g-2-1 mt16">
        <Card title={<div className="row gap8 wrap"><h3 style={{ margin: 0 }}>Выполнение</h3><Seg value={mode} onChange={setMode} options={[{ value: 'rep', label: 'Сотрудники' }, { value: 'store', label: 'Точки' }]} /></div>} pad0>
          <div className="table-wrap">
            {mode === 'rep' ? (
              <table className="t"><thead><tr><th>Сотрудник</th><th className="r">План</th><th className="r">Прогноз</th><th style={{ width: '24%' }}>Выполнение</th><th className="r">Скоррект.</th><th>Уровень</th></tr></thead>
                <tbody>{d.reps.map(({ r, p }) => { const tier = bonusTier(p.adjusted); return (
                  <tr key={r}><td><b>{personName(r)}</b></td><td className="r">{moneyShort(p.realistic)}</td><td className="r">{moneyShort(p.forecast)}</td><td><div className="row gap8"><div className="grow"><Bar value={p.completion / 1.2} ticks={[0.8 / 1.2, 1 / 1.2]} color={p.completion >= 1 ? 'var(--green)' : p.completion >= 0.8 ? 'var(--blue)' : 'var(--red)'} /></div><span className="num t-foot">{pct(p.completion)}</span></div></td><td className="r">{pct(p.adjusted)}</td><td><span className={`badge ${tier ? 'green' : ''}`}>{tier ? `${tier}%` : 'ниже 80%'}</span></td></tr>
                ); })}</tbody></table>
            ) : (
              <table className="t"><thead><tr><th>Точка</th><th>Кат.</th><th className="r">План</th><th className="r">Прогноз</th><th className="r">%</th></tr></thead>
                <tbody>{d.stores.map(({ x, p }) => <tr key={x.id}><td>{x.name}</td><td>{x.category}</td><td className="r">{money(p.realistic)}</td><td className="r">{money(p.forecast)}</td><td className={`r ${p.forecast / p.realistic < 0.8 ? 'delta-down' : ''}`}>{pct(p.forecast / p.realistic)}</td></tr>)}</tbody></table>
            )}
          </div>
        </Card>
        <Card title="Причины невыполнения">
          {lossItems.length ? <HBar items={lossItems} /> : <div className="t-sub sec">Существенных потерь не выявлено</div>}
          <div className="hint mt12">Оценка упущенной выручки с начала месяца относительно базового уровня точки, распределённая по наиболее вероятной причине. Это ориентир для разбора, а не бухгалтерская величина.</div>
        </Card>
      </div>
    </>
  );
}
