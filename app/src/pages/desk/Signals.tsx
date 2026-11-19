import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { hub, personName } from '../../api/hub';
import { checkRecovered, dayIndex, revenueSeries, storeRevenue, storeUnits } from '../../domain/engine';
import type { Dept, Signal, SignalStatus, SignalType } from '../../domain/types';
import { DEPT_LABEL, SIGNAL_LABEL, SIGNAL_STATUS_LABEL } from '../../domain/types';
import { addDays, fmtDateTime, fmtDay, fmtDayShort } from '../../lib/date';
import { num, pct } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Columns } from '../../ui/charts';
import { CONF_LABEL, Card, Empty, Field, SEV_ICON, STATUS_BADGE, Seg, Sheet, useAction, useHub } from '../../ui/kit';
import { BackLink, PageHead, SignalRow, TaskLine, storeName } from './common';
import { TaskSheet } from './Tasks';
import { exportTable } from '../../lib/exporter';

type F = 'active' | 'monitoring' | 'closed' | 'all';

export function Signals() {
  const s = useHub();
  const ws = s.ws!;
  const role = s.user!.role;
  const [f, setF] = useState<F>('active');
  const [type, setType] = useState<SignalType | ''>('');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    return Object.values(ws.signals)
      .filter((x) => role === 'admin' || role === 'manager' || x.hypotheses.some((h) => h.dept === role) || x.taskIds.some((id) => ws.tasks.find((t) => t.id === id)?.dept === role))
      .filter((x) => (f === 'active' ? x.status === 'new' || x.status === 'in_progress' : f === 'monitoring' ? x.status === 'monitoring' : f === 'closed' ? x.status === 'resolved' || x.status === 'dismissed' : true))
      .filter((x) => !type || x.type === type)
      .filter((x) => !q || (x.title + x.summary).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity] || b.detectedAt - a.detectedAt);
  }, [ws, f, type, q, role, s.version]);
  const byType = Object.values(ws.signals).filter((x) => x.status === 'new' || x.status === 'in_progress').reduce<Record<string, number>>((a, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {});

  return (
    <>
      <PageHead title="Сигналы" sub="Отклонения, которые DairyHub обнаружил автоматически, с возможными причинами и ответственными" actions={<button className="btn" onClick={() => exportTable('dairyhub-signaly', ['Обнаружен', 'Тип', 'Важность', 'Статус', 'Сигнал', 'Описание', 'Основная причина', 'Подразделение'], list.map((x) => [fmtDateTime(x.detectedAt), SIGNAL_LABEL[x.type], x.severity === 'high' ? 'высокая' : x.severity === 'medium' ? 'средняя' : 'низкая', SIGNAL_STATUS_LABEL[x.status], x.title, x.summary, x.hypotheses[0]?.title ?? '', x.hypotheses[0] ? DEPT_LABEL[x.hypotheses[0].dept] : '']))}><Icon name="doc" size={16} />Excel</button>} />
      <div className="row gap8 wrap" style={{ marginBottom: 16 }}>
        <Seg value={f} onChange={setF} options={[{ value: 'active', label: 'Активные' }, { value: 'monitoring', label: 'На контроле' }, { value: 'closed', label: 'Закрытые' }, { value: 'all', label: 'Все' }]} />
        <select className="input sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as SignalType)} aria-label="Тип сигнала">
          <option value="">Все типы</option>
          {Object.entries(SIGNAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{byType[k] ? ` (${byType[k]})` : ''}</option>)}
        </select>
        <div className="search"><Icon name="search" size={16} /><input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <Card pad0>{list.length === 0 ? <Empty title="Сигналов нет" text="По выбранным фильтрам ничего не найдено" /> : list.map((x) => <SignalRow key={x.id} s={x} />)}</Card>
    </>
  );
}

function stageOf(s: Signal, tasksDone: boolean): number {
  if (s.status === 'resolved' || s.status === 'dismissed') return 6;
  if (s.status === 'monitoring') return 5;
  if (s.taskIds.length) return tasksDone ? 5 : 4;
  return 3;
}

export function SignalDetail() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const sig = ws.signals[decodeURIComponent(id ?? '')];
  const isMgr = s.user!.role === 'manager' || s.user!.role === 'admin';
  const [task, setTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<Dept | null>(null);
  const [statusSheet, setStatusSheet] = useState<SignalStatus | null>(null);

  const chart = useMemo(() => {
    if (!sig) return null;
    const T = dayIndex(ws, s.today);
    let arr: number[] | null = null;
    let unit = '₸';
    if (sig.type === 'sales_drop' && sig.storeId) { arr = storeUnits(ws, sig.storeId, sig.skuIds); unit = 'шт'; }
    else if (sig.type === 'rep_drop' && sig.repId) arr = revenueSeries(ws, ws.stores.filter((x) => x.repId === sig.repId).map((x) => x.id));
    else if ((sig.type === 'freezer_no_sales' || sig.type === 'relocation') && sig.storeId) arr = storeRevenue(ws, sig.storeId, (k) => ws.skus.find((x) => x.id === k)!.frozen);
    else if (sig.type === 'temperature' && sig.freezerId) return { temps: ws.temps[sig.freezerId] };
    if (!arr) return null;
    const vals = arr.slice(T - 35, T);
    return { vals, labels: vals.map((_, i) => fmtDayShort(addDays(s.today, i - 35))), unit };
  }, [sig, ws, s.today]);

  if (!sig) return <Empty icon="search" title="Сигнал не найден" />;
  const tasks = sig.taskIds.map((tid) => ws.tasks.find((t) => t.id === tid)!).filter(Boolean);
  const tasksDone = tasks.length > 0 && tasks.every((t) => t.status === 'done');
  const stage = stageOf(sig, tasksDone);
  const rec = sig.status === 'monitoring' ? checkRecovered(ws, sig, s.today) : null;
  const steps = ['Обнаружение', 'Анализ данных', 'Причина', 'Задача', 'Устранение', 'Контроль'];

  return (
    <>
      <BackLink to="/app/signals" label="Сигналы" />
      <div className="page-h">
        <div className="row gap16" style={{ alignItems: 'flex-start' }}>
          <span className={`sev ${sig.severity}`} style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name={SEV_ICON[sig.type]} size={24} /></span>
          <div>
            <div className="row gap8 wrap"><span className={`badge ${STATUS_BADGE[sig.status]}`}>{SIGNAL_STATUS_LABEL[sig.status]}</span><span className="badge">{SIGNAL_LABEL[sig.type]}</span><span className="t-foot sec">{fmtDateTime(sig.detectedAt)}</span></div>
            <h1 className="t-title1" style={{ margin: '6px 0 0' }}>{sig.title}</h1>
            <div className="t-sub sec mt4" style={{ maxWidth: 780 }}>{sig.summary}</div>
          </div>
        </div>
        {isMgr && sig.status !== 'resolved' && sig.status !== 'dismissed' && (
          <div className="row gap8 wrap">
            <button className="btn" onClick={() => setNewTask('manager')}><Icon name="plus" size={16} />Задача</button>
            {sig.status !== 'monitoring' && <button className="btn" onClick={() => setStatusSheet('monitoring')}>На контроль</button>}
            <button className="btn success" onClick={() => setStatusSheet('resolved')}>Решён</button>
            <button className="btn danger" onClick={() => setStatusSheet('dismissed')}>Отклонить</button>
          </div>
        )}
      </div>

      <div className="chain">
        {steps.map((t, i) => (
          <div key={t} className={`chain-step ${i + 1 < stage || stage === 6 ? 'done' : ''} ${i + 1 === stage && stage !== 6 ? 'cur' : ''}`}>
            <div className="n">{i + 1 < stage || stage === 6 ? <Icon name="check" size={13} stroke={3} /> : i + 1}</div>
            <div className="t-foot bold">{t}</div>
          </div>
        ))}
      </div>

      <div className="grid g-2-1 mt16">
        <div className="col gap16">
          {chart && 'vals' in chart && chart.vals && (
            <Card title="Динамика за 35 дней" action={<span className="t-foot sec">красным — последние 7 дней</span>}>
              <Columns values={chart.vals} labels={chart.labels} highlightFrom={28} format={(n) => (chart.unit === 'шт' ? `${num(n)} шт` : `${num(n)} ₸`)} />
            </Card>
          )}
          {chart && 'temps' in chart && chart.temps && (
            <Card title="Датчик температуры · 72 часа">
              <Columns values={chart.temps.map((t) => t + 30)} labels={chart.temps.map((_, i) => `${72 - i} ч назад`)} color="var(--teal)" highlightFrom={chart.temps.length - (sig.metrics.hours || 0)} format={(n) => `${(n - 30).toFixed(1).replace('.', ',').replace('-', '−')} °C`} />
              <div className="t-foot sec mt8">Норма ≤ −18 °C, порог сигнала {ws.settings.tempLimit} °C более {ws.settings.tempHours} ч</div>
            </Card>
          )}
          <Card title={<div className="row gap8"><Icon name="sparkles" size={18} className="c-indigo" /><h3 style={{ margin: 0 }}>Возможные причины</h3></div>} action={<span className="t-foot sec">не является оценкой сотрудника</span>}>
            {sig.hypotheses.length === 0 ? <div className="t-sub sec">Сигнал-напоминание, анализ причин не требуется.</div> : (
              <div className="col gap12">
                {sig.hypotheses.map((h, i) => (
                  <div key={i} className={`hyp ${h.confidence}`}>
                    <div className="row between wrap gap8">
                      <b className="t-headline">{h.title}</b>
                      <div className="row gap4"><span className={`badge ${h.confidence === 'high' ? 'red' : h.confidence === 'medium' ? 'orange' : ''}`}>{CONF_LABEL[h.confidence]}</span><span className="badge blue">→ {DEPT_LABEL[h.dept]}</span></div>
                    </div>
                    <ul>{h.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul>
                    <div className="t-foot mt8"><b>Рекомендуемое действие:</b> {h.action}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="col gap16">
          <Card title="Контекст">
            <div className="col gap8 t-foot">
              {sig.storeId && <div className="row between"><span className="sec">Точка</span><Link to={`/app/stores/${sig.storeId}`}>{storeName(sig.storeId)}</Link></div>}
              {sig.repId && <div className="row between"><span className="sec">Представитель</span>{s.user!.role === 'manager' || s.user!.role === 'admin' ? <Link to={`/app/team/${sig.repId}`}>{personName(sig.repId)}</Link> : <span>{personName(sig.repId)}</span>}</div>}
              {sig.freezerId && <div className="row between"><span className="sec">Оборудование</span><Link to={`/app/equipment/${sig.freezerId}`}>{ws.freezers.find((f) => f.id === sig.freezerId)?.serial}</Link></div>}
              {sig.skuIds && sig.skuIds.length < 10 && <div className="row between"><span className="sec">Товары</span><span style={{ textAlign: 'right' }}>{sig.skuIds.map((k) => ws.skus.find((x) => x.id === k)?.short).join(', ')}</span></div>}
              {sig.monitorUntil && <div className="row between"><span className="sec">Контроль до</span><span>{fmtDay(sig.monitorUntil)}</span></div>}
            </div>
            {rec && <div className={`${rec.recovered ? 'ok-box' : 'info-box'} mt12`}>Текущий уровень продаж: {pct(rec.ratio)} от базового. {rec.recovered ? 'Восстановление подтверждается.' : 'Мониторинг продолжается.'}</div>}
          </Card>
          <Card title="Задачи подразделениям" pad0>
            {tasks.length === 0 ? <Empty icon="checklist" title="Задач нет" text={isMgr ? 'Создайте задачу кнопкой «Задача»' : undefined} /> : tasks.map((t) => <TaskLine key={t.id} t={t} onClick={() => setTask(t.id)} />)}
          </Card>
          <Card title="История">
            <div className="col gap12">
              {[...sig.history].reverse().map((h, i) => (
                <div key={i} className="row gap8" style={{ alignItems: 'flex-start' }}>
                  <span className="dot mt4" style={{ background: h.by === 'DairyHub' ? 'var(--indigo)' : 'var(--blue)', marginTop: 6 }} />
                  <div className="grow"><div className="t-foot">{h.text}</div><div className="t-cap ter">{h.by} · {fmtDateTime(h.t)}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <TaskSheet id={task} onClose={() => setTask(null)} />
      <NewTaskSheet open={!!newTask} onClose={() => setNewTask(null)} signal={sig} />
      <StatusSheet status={statusSheet} onClose={() => setStatusSheet(null)} signal={sig} />
    </>
  );
}

export function NewTaskSheet({ open, onClose, signal, storeId }: { open: boolean; onClose: () => void; signal?: Signal; storeId?: string }) {
  const s = useHub();
  const { run, busy } = useAction();
  const sid = signal?.storeId ?? storeId;
  const [f, setF] = useState({ title: '', description: '', dept: (signal?.hypotheses[0]?.dept ?? 'warehouse') as Dept });
  const submit = async () => {
    const assignee = f.dept === 'rep' && sid ? s.ws!.stores.find((x) => x.id === sid)?.repId : undefined;
    const r = await run(() => hub.createTask({ ...f, storeId: sid, signalId: signal?.id, assigneeId: assignee }).then(() => true), 'Задача создана и направлена');
    if (r) { onClose(); setF({ ...f, title: '', description: '' }); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Новая задача">
      <div className="col gap16">
        <div className="field"><span className="field-label">Подразделение</span>
          <Seg full value={f.dept} onChange={(v) => setF({ ...f, dept: v })} options={(['warehouse', 'accounting', 'manager', 'rep'] as Dept[]).map((d) => ({ value: d, label: d === 'rep' ? 'Представитель' : DEPT_LABEL[d] }))} />
        </div>
        <Field label="Что нужно сделать"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={signal?.hypotheses[0]?.action ?? 'Название задачи'} /></Field>
        <Field label="Описание и основание"><textarea className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="hint">SLA: склад — 24 ч, бухгалтерия и руководитель — 48 ч, представитель — до следующего визита.</div>
        <button className="btn primary lg block" disabled={busy || !f.title.trim()} onClick={submit}>Направить задачу</button>
      </div>
    </Sheet>
  );
}

function StatusSheet({ status, onClose, signal }: { status: SignalStatus | null; onClose: () => void; signal: Signal }) {
  const [c, setC] = useState('');
  const { run, busy } = useAction();
  const title = status === 'resolved' ? 'Отметить как решённый' : status === 'dismissed' ? 'Отклонить сигнал' : 'Поставить на контроль';
  return (
    <Sheet open={!!status} onClose={onClose} title={title}>
      <div className="col gap16">
        {status === 'dismissed' && <div className="info-box t-foot">Укажите, почему отклонение не требует действий (например, плановое закрытие точки на ремонт). Это улучшает качество правил.</div>}
        {status === 'monitoring' && <div className="info-box t-foot">DairyHub будет отслеживать продажи 14 дней и автоматически закроет сигнал при восстановлении до 90% от базового уровня.</div>}
        <Field label={status === 'dismissed' ? 'Причина (обязательно)' : 'Комментарий'}><textarea className="input" value={c} onChange={(e) => setC(e.target.value)} /></Field>
        <button className={`btn lg block ${status === 'dismissed' ? 'danger' : 'primary'}`} disabled={busy || (status === 'dismissed' && !c.trim())} onClick={async () => { const r = await run(() => hub.setSignalStatus(signal.id, status!, c).then(() => true), 'Статус обновлён'); if (r) { setC(''); onClose(); } }}>{title}</button>
      </div>
    </Sheet>
  );
}
