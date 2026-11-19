import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { hub, nextVisitDate, visitsToday } from '../../api/hub';
import { TIER_LABEL, aggregatePlan, bonusTier, dayIndex, dropRatio, revenueSeries, visitStats } from '../../domain/engine';
import { FREEZER_STATUS_LABEL, ROLE_LABEL, SIGNAL_LABEL } from '../../domain/types';
import { fmtDay, fmtDayShort, fmtTime, fmtWeekdayLong, relTime } from '../../lib/date';
import { haversine } from '../../lib/geo';
import { money, moneyShort, pct, signedPct } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { PlanRings } from '../../ui/charts';
import { MapView } from '../../ui/MapView';
import { Avatar, CONF_LABEL, Empty, SEV_ICON, useAction, useHub } from '../../ui/kit';
import { TaskSheet } from '../desk/Tasks';
import { taskState } from '../desk/common';
import { PasswordForm } from '../desk/Profile';
import { VisitFlow } from './VisitFlow';
import { NotificationSettings } from '../../ui/system';
import { ShiftCard, ShiftTracker } from './Shift';

export function usePosition() {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) { setErr('Геолокация недоступна'); return; }
    const id = navigator.geolocation.watchPosition(setPos, (e) => setErr(e.code === 1 ? 'Доступ к геолокации запрещён' : 'Не удалось определить местоположение'), { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { pos, err };
}

function myTasks() {
  const s = hub.state;
  const mine = new Set(s.ws!.stores.filter((x) => x.repId === s.user!.id).map((x) => x.id));
  return s.ws!.tasks.filter((t) => t.assigneeId === s.user!.id || (t.dept === 'rep' && t.storeId && mine.has(t.storeId)));
}

export default function RepApp() {
  const s = useHub();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { document.body.classList.add('rep-mode'); return () => document.body.classList.remove('rep-mode'); }, []);
  useEffect(() => { if (s.user!.mustChangePassword && !s.impersonator && !loc.pathname.endsWith('/me')) nav('/rep/me'); }, [s.user, s.impersonator, loc.pathname, nav]);
  const unread = hub.myNotices().filter((n) => !n.readBy.includes(s.user!.id)).length;
  const openTasks = myTasks().filter((t) => t.status !== 'done').length;
  const inVisit = loc.pathname.includes('/visit/');
  const tabs = [
    { to: '/rep', label: 'Сегодня', icon: 'home', end: true },
    { to: '/rep/stores', label: 'Точки', icon: 'store' },
    { to: '/rep/tasks', label: 'Задачи', icon: 'checklist', count: openTasks },
    { to: '/rep/inbox', label: 'Входящие', icon: 'bell', count: unread },
    { to: '/rep/me', label: 'Профиль', icon: 'person' },
  ];
  return (
    <div className="phone">
      {!s.impersonator && <ShiftTracker />}
      {s.impersonator && <div className="imp-bar"><Icon name="eye" size={16} />Просмотр как {s.user!.name}<button className="btn sm" onClick={() => hub.stopImpersonation()}>Вернуться</button></div>}
      <div className="fade-in" key={loc.pathname}>
        <Routes>
          <Route index element={<Today />} />
          <Route path="stores" element={<MyStores />} />
          <Route path="store/:id" element={<RepStore />} />
          <Route path="visit/:id" element={<VisitFlow />} />
          <Route path="tasks" element={<RepTasks />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="signals/:id" element={<RepSignal />} />
          <Route path="me" element={<Me />} />
          <Route path="*" element={<Navigate to="/rep" replace />} />
        </Routes>
      </div>
      {!inVisit && (
        <nav className="tabbar glass" aria-label="Навигация">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
              <Icon name={t.icon} />{t.label}
              {!!t.count && <span className="count">{t.count}</span>}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

function LargeTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="nav-large row between" style={{ alignItems: 'flex-end', paddingTop: 'max(18px, env(safe-area-inset-top))' }}>
      <div><div className="t-foot sec up">{sub}</div><div className="t-large">{title}</div></div>
      {right}
    </div>
  );
}

function Today() {
  const s = useHub();
  const ws = s.ws!;
  const me = s.user!;
  const nav = useNavigate();
  const { pos } = usePosition();
  const visits = visitsToday(me.id).sort((a, b) => (a.checkIn?.t ?? Infinity) - (b.checkIn?.t ?? Infinity));
  const order = [...visits.filter((v) => v.status === 'done'), ...visits.filter((v) => v.status === 'in_progress'), ...visits.filter((v) => v.status === 'planned')];
  const st = visitStats(visits);
  const plan = useMemo(() => aggregatePlan(ws, ws.stores.filter((x) => x.repId === me.id), s.today), [ws, me.id, s.today, s.version]);
  const tier = bonusTier(plan.adjusted);
  const next = [80, 100, 120].find((t) => plan.completion * 100 < t);
  const tasks = myTasks().filter((t) => t.status !== 'done');
  const reports = ws.visits.filter((v) => v.repId === me.id && v.status === 'done' && !v.reportDone);
  const current = visits.find((v) => v.status === 'in_progress');
  const signals = Object.values(ws.signals).filter((x) => x.repId === me.id && (x.status === 'new' || x.status === 'in_progress') && x.type === 'freezer_no_sales');
  return (
    <>
      <LargeTitle title="Сегодня" sub={`${fmtWeekdayLong(s.today)}, ${fmtDay(s.today)}`} right={<Link to="/rep/me"><Avatar name={me.name} /></Link>} />
      <div className="pad col gap16">
        {current && (
          <button className="card row gap12" style={{ background: 'var(--blue)', color: '#fff', border: 0, textAlign: 'left' }} onClick={() => nav(`/rep/visit/${current.id}`)}>
            <Icon name="clock" size={26} />
            <div className="grow"><div className="t-foot" style={{ opacity: 0.85 }}>Идёт визит · с {fmtTime(current.checkIn!.t)}</div><div className="t-headline">{ws.stores.find((x) => x.id === current.storeId)!.name}</div></div>
            <Icon name="chevR" size={20} />
          </button>
        )}
        <ShiftCard />
        <Link to="/rep/me" className="card row gap16" style={{ color: 'inherit' }}>
          <PlanRings value={plan.completion} size={96} />
          <div className="grow">
            <div className="t-foot sec">План месяца · прогноз</div>
            <div className="t-title1">{pct(plan.completion)}</div>
            <div className="t-foot sec">{tier ? TIER_LABEL[tier] : 'до уровня 1 (80%)'}{next ? ` · до ${next}%: ${Math.max(0, next - Math.round(plan.completion * 100))}%` : ''}</div>
          </div>
        </Link>
        {(reports.length > 0 || tasks.length > 0 || signals.length > 0) && (
          <div className="list">
            {reports.map((v) => (
              <Link key={v.id} to={`/rep/visit/${v.id}`} className="cell"><span className="cell-icon" style={{ background: 'var(--indigo)' }}><Icon name="doc" size={16} /></span><div className="cell-main"><div className="cell-title">Заполните отчёт</div><div className="cell-sub">{ws.stores.find((x) => x.id === v.storeId)!.name} · {fmtDayShort(v.date)}</div></div><Icon name="chevR" size={16} className="chev" /></Link>
            ))}
            {signals.map((x) => (
              <Link key={x.id} to={`/rep/signals/${encodeURIComponent(x.id)}`} className="cell"><span className="cell-icon" style={{ background: 'var(--orange)' }}><Icon name="snow" size={16} /></span><div className="cell-main"><div className="cell-title">{x.title}</div><div className="cell-sub">Пройдите диагностику при визите</div></div><Icon name="chevR" size={16} className="chev" /></Link>
            ))}
            {tasks.length > 0 && <Link to="/rep/tasks" className="cell"><span className="cell-icon" style={{ background: 'var(--blue)' }}><Icon name="checklist" size={16} /></span><div className="cell-main"><div className="cell-title">Задачи: {tasks.length}</div><div className="cell-sub">{tasks[0].title}</div></div><Icon name="chevR" size={16} className="chev" /></Link>}
          </div>
        )}
        <div>
          <div className="row between" style={{ padding: '0 4px 6px' }}><span className="t-title3">Маршрут</span><span className="t-foot sec">{st.done} из {st.planned} · {pct(st.coverage)}</span></div>
          {order.length === 0 ? <div className="card"><Empty icon="route" title="Сегодня визитов нет" text="Можно сделать внеплановый визит из списка точек" /></div> : (
            <div className="list">
              {order.map((v, i) => {
                const store = ws.stores.find((x) => x.id === v.storeId)!;
                const dist = pos ? haversine(pos.coords.latitude, pos.coords.longitude, store.lat, store.lng) : null;
                const late = v.status === 'planned' && new Date().getHours() >= 19;
                return (
                  <Link key={v.id} to={v.status === 'planned' ? `/rep/store/${store.id}` : `/rep/visit/${v.id}`} className="cell">
                    <span className="cell-icon" style={{ background: v.status === 'done' ? 'var(--green)' : v.status === 'in_progress' ? 'var(--blue)' : late ? 'var(--red)' : 'var(--fill)', color: v.status === 'planned' && !late ? 'var(--label)' : '#fff', borderRadius: 15 }}>{v.status === 'done' ? <Icon name="check" size={16} stroke={2.6} /> : <b className="t-foot">{i + 1}</b>}</span>
                    <div className="cell-main">
                      <div className="cell-title">{store.name}</div>
                      <div className="cell-sub">{v.status === 'done' ? `Выполнен · ${fmtTime(v.checkIn!.t)}${v.orderTotal ? ` · заказ ${moneyShort(v.orderTotal)}` : ''}${v.reportDone ? '' : ' · нет отчёта'}` : v.status === 'in_progress' ? 'Визит идёт' : `${store.address.replace('г. Алматы, ', '')}${dist !== null && dist < 50000 ? ` · ${(dist / 1000).toFixed(1).replace('.', ',')} км` : ''}`}</div>
                    </div>
                    {v.flags.length > 0 && <span className="badge orange">{v.flags[0]}</span>}
                    <Icon name="chevR" size={16} className="chev" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MyStores() {
  const s = useHub();
  const ws = s.ws!;
  const [q, setQ] = useState('');
  const T = dayIndex(ws, s.today);
  const mine = ws.stores.filter((x) => x.repId === s.user!.id && (!q || x.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <LargeTitle title="Мои точки" sub={`${mine.length} точек`} />
      <div className="pad col gap12">
        <div className="search" style={{ flex: 'none', height: 40 }}><Icon name="search" size={16} /><input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="card pad0" style={{ padding: 0, overflow: 'hidden' }}><MapView className="sm" points={mine.map((x) => ({ id: x.id, lat: x.lat, lng: x.lng, color: '#0a84ff', label: x.category, popup: x.name }))} /></div>
        <div className="list">
          {mine.map((x) => {
            const d = dropRatio(revenueSeries(ws, [x.id]), T - 1);
            const nv = nextVisitDate(x.id);
            return (
              <Link key={x.id} to={`/rep/store/${x.id}`} className="cell">
                <div className="cell-main"><div className="cell-title">{x.name}</div><div className="cell-sub">Кат. {x.category} · след. визит {nv ? (nv === s.today ? 'сегодня' : fmtDayShort(nv)) : '—'}</div></div>
                <span className={d.change >= 0 ? 'delta-up t-foot' : 'delta-down t-foot'}>{signedPct(d.change)}</span>
                <Icon name="chevR" size={16} className="chev" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavBack({ title, to = -1 as unknown as string }: { title: string; to?: string }) {
  const nav = useNavigate();
  return (
    <div className="nav-bar glass">
      <button className="back" onClick={() => (typeof to === 'string' ? nav(to) : nav(-1))}><Icon name="chevL" size={22} />Назад</button>
      <span className="title ellipsis">{title}</span>
      <span style={{ width: 70 }} />
    </div>
  );
}

function RepStore() {
  const { id } = useParams();
  const s = useHub();
  const ws = s.ws!;
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [task, setTask] = useState<string | null>(null);
  const st = ws.stores.find((x) => x.id === id);
  if (!st) return <Empty title="Точка не найдена" />;
  const today = ws.visits.find((v) => v.storeId === st.id && v.date === s.today && v.repId === s.user!.id && v.status !== 'done');
  const last = ws.visits.filter((v) => v.storeId === st.id && v.status === 'done').sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const fz = ws.freezers.filter((f) => f.storeId === st.id);
  const tasks = myTasks().filter((t) => t.storeId === st.id && t.status !== 'done');
  return (
    <>
      <NavBack title={st.name} to="/rep" />
      <div className="pad col gap16" style={{ paddingTop: 12 }}>
        <div><div className="t-title2">{st.name}</div><div className="t-foot sec">{st.channel} · категория {st.category} · {st.address}</div><div className="t-foot sec">{st.contact}</div></div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><MapView className="sm" points={[{ id: st.id, lat: st.lat, lng: st.lng, color: '#0a84ff', label: st.category }]} radius={{ lat: st.lat, lng: st.lng, m: ws.settings.geofenceM }} /></div>
        {st.shipmentsBlocked && <div className="error-box"><b>Отгрузки заблокированы.</b> Просроченная задолженность {money(st.debt)} ({st.debtOverdueDays} дн). Вопрос в работе у бухгалтерии — заказ не будет отгружен до разблокировки.</div>}
        {!st.shipmentsBlocked && st.debtOverdueDays > 0 && <div className="info-box t-foot">Просрочка оплаты {st.debtOverdueDays} дн — напомните клиенту об оплате.</div>}
        {tasks.length > 0 && <div><div className="group-title">Задачи по точке</div><div className="list">{tasks.map((t) => <button key={t.id} className="cell" onClick={() => setTask(t.id)}><span className="cell-icon" style={{ background: 'var(--orange)' }}><Icon name="flag" size={16} /></span><div className="cell-main"><div className="cell-title">{t.title}</div><div className="cell-sub">{taskState(t).label}</div></div><Icon name="chevR" size={16} className="chev" /></button>)}</div></div>}
        <div>
          <div className="group-title">Оборудование</div>
          <div className="list">{fz.length === 0 ? <div className="cell sec">Морозильника нет</div> : fz.map((f) => <div key={f.id} className="cell"><span className="cell-icon" style={{ background: f.status === 'installed' ? 'var(--teal)' : 'var(--red)' }}><Icon name="freezer" size={16} /></span><div className="cell-main"><div className="cell-title">{f.serial}</div><div className="cell-sub">{f.model} · {FREEZER_STATUS_LABEL[f.status]}{f.program ? ` · программа: этап ${f.program.stage}` : ''}</div></div></div>)}</div>
        </div>
        {last && <div><div className="group-title">Последний визит</div><div className="list"><div className="cell"><div className="cell-main"><div className="cell-title">{fmtDay(last.date)}{last.checkIn ? `, ${fmtTime(last.checkIn.t)}` : ''}</div><div className="cell-sub">{last.orderTotal ? `Заказ ${money(last.orderTotal)}` : 'Без заказа'}{last.comment ? ` · «${last.comment}»` : ''}</div></div></div></div></div>}
        {today ? (
          <button className="btn primary lg block" onClick={() => nav(`/rep/visit/${today.id}`)}><Icon name="location" size={18} />{today.status === 'in_progress' ? 'Продолжить визит' : 'Начать визит'}</button>
        ) : (
          <button className="btn lg block" disabled={busy} onClick={async () => { const vid = await run(() => hub.adhocVisit(st.id)); if (vid) nav(`/rep/visit/${vid}`); }}><Icon name="plus" size={18} />Внеплановый визит</button>
        )}
      </div>
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}

function RepTasks() {
  const s = useHub();
  const [task, setTask] = useState<string | null>(null);
  const list = myTasks().sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || a.dueAt - b.dueAt);
  void s.version;
  return (
    <>
      <LargeTitle title="Задачи" sub="от руководителя и DairyHub" />
      <div className="pad">
        {list.length === 0 ? <div className="card"><Empty icon="checklist" title="Задач нет" /></div> : (
          <div className="list">
            {list.slice(0, 40).map((t) => { const st = taskState(t); return (
              <button key={t.id} className="cell" onClick={() => setTask(t.id)}>
                <span className="cell-icon" style={{ background: t.status === 'done' ? 'var(--green)' : st.cls === 'red' ? 'var(--red)' : 'var(--orange)' }}><Icon name={t.status === 'done' ? 'check' : 'flag'} size={16} /></span>
                <div className="cell-main"><div className="cell-title" style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</div><div className="cell-sub">{st.label} · {relTime(t.createdAt)}</div></div>
                <Icon name="chevR" size={16} className="chev" />
              </button>
            ); })}
          </div>
        )}
      </div>
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}

function Inbox() {
  const s = useHub();
  const nav = useNavigate();
  const list = hub.myNotices().slice(0, 60);
  return (
    <>
      <LargeTitle title="Входящие" sub="уведомления" right={<button className="btn sm" onClick={() => hub.markRead(list.map((n) => n.id))}>Прочитать все</button>} />
      <div className="pad">
        {list.length === 0 ? <div className="card"><Empty icon="bell" title="Уведомлений нет" /></div> : (
          <div className="list">
            {list.map((n) => { const unread = !n.readBy.includes(s.user!.id); return (
              <button key={n.id} className="cell" onClick={() => { void hub.markRead([n.id]); if (n.link?.startsWith('/signals')) nav('/rep' + n.link); else if (n.link === '/tasks') nav('/rep/tasks'); }}>
                <span className="cell-icon" style={{ background: n.kind === 'signal' ? 'var(--orange)' : n.kind === 'task' ? 'var(--blue)' : 'var(--indigo)' }}><Icon name={n.kind === 'signal' ? 'bolt' : n.kind === 'task' ? 'checklist' : 'clock'} size={16} /></span>
                <div className="cell-main"><div className="cell-title" style={{ fontWeight: unread ? 600 : 400 }}>{n.title}</div><div className="cell-sub">{n.body}</div><div className="t-cap ter mt4">{relTime(n.t)}</div></div>
                {unread && <span className="dot" style={{ background: 'var(--blue)' }} />}
              </button>
            ); })}
          </div>
        )}
      </div>
    </>
  );
}

function RepSignal() {
  const { id } = useParams();
  const s = useHub();
  const sig = s.ws!.signals[decodeURIComponent(id ?? '')];
  if (!sig) return <Empty title="Не найдено" />;
  return (
    <>
      <NavBack title={SIGNAL_LABEL[sig.type]} />
      <div className="pad col gap16" style={{ paddingTop: 12 }}>
        <div className="row gap12"><span className={`sev ${sig.severity}`} style={{ width: 44, height: 44 }}><Icon name={SEV_ICON[sig.type]} size={22} /></span><div className="t-title3">{sig.title}</div></div>
        <div className="t-sub sec">{sig.summary}</div>
        {sig.hypotheses.length > 0 && <div className="group-title" style={{ paddingLeft: 0 }}>Возможные причины</div>}
        {sig.hypotheses.map((h, i) => (
          <div key={i} className={`hyp ${h.confidence}`}><b>{h.title}</b><div className="t-cap sec">{CONF_LABEL[h.confidence]}</div><ul>{h.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul><div className="t-foot mt8">{h.action}</div></div>
        ))}
        <div className="info-box t-foot">Это подсказка системы, а не оценка вашей работы. Если причина другая — напишите комментарий в задаче, руководитель увидит его.</div>
        {sig.storeId && <Link to={`/rep/store/${sig.storeId}`} className="btn primary lg block">Открыть точку</Link>}
      </div>
    </>
  );
}

function Me() {
  const s = useHub();
  const ws = s.ws!;
  const me = s.user!;
  const plan = useMemo(() => aggregatePlan(ws, ws.stores.filter((x) => x.repId === me.id), s.today), [ws, me.id, s.today, s.version]);
  const v = visitStats(ws.visits.filter((x) => x.repId === me.id && x.date < s.today && x.date >= s.today.slice(0, 8) + '01'));
  const tier = bonusTier(plan.adjusted);
  return (
    <>
      <LargeTitle title="Профиль" sub={ROLE_LABEL[me.role]} />
      <div className="pad col gap16">
        {me.mustChangePassword && <div className="error-box">Вы вошли с временным паролем — установите собственный.</div>}
        <div className="card row gap16"><Avatar name={me.name} size="lg" /><div><div className="t-title3">{me.name}</div><div className="t-foot sec">{me.email}</div><div className="t-foot sec">{ws.company}</div></div></div>
        <div className="card">
          <div className="row gap16"><PlanRings value={plan.completion} size={120} /><div className="col gap4 t-foot"><div className="t-title1">{pct(plan.completion)}</div><div className="sec">прогноз к плану</div><span className={`badge ${tier ? 'green' : ''}`}>{TIER_LABEL[tier]}</span></div></div>
          <div className="col gap8 t-foot mt16">
            <div className="row between"><span className="sec">План месяца</span><b>{money(plan.realistic)}</b></div>
            <div className="row between"><span className="sec">Факт</span><b>{money(plan.fact)}</b></div>
            <div className="row between"><span className="sec">С учётом внешних причин</span><b className="c-green">{pct(plan.adjusted)}</b></div>
            <div className="row between"><span className="sec">Визиты в этом месяце</span><b>{v.done} из {v.planned}</b></div>
          </div>
          <div className="hint mt8">Премия: уровни 80%, 100% и 120% плана. Задержки поставок и блокировки отгрузок не уменьшают ваш результат.</div>
        </div>
        <div><div className="group-title">Уведомления</div><NotificationSettings /></div>
        <div className="card"><div className="t-headline" style={{ marginBottom: 12 }}>Смена пароля</div><PasswordForm /></div>
        <button className="btn danger lg block" onClick={() => hub.logout()}><Icon name="logout" size={18} />Выйти</button>
        <Link to="/" className="btn plain block">О проекте DairyHub</Link>
      </div>
    </>
  );
}
