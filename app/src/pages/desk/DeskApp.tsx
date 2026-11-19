import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { hub } from '../../api/hub';
import type { Role } from '../../domain/types';
import { ROLE_LABEL } from '../../domain/types';
import { relTime } from '../../lib/date';
import { Icon, Logo } from '../../ui/Icon';
import { Avatar, Empty, Sheet, useHub } from '../../ui/kit';
import { Overview } from './Overview';
import { SignalDetail, Signals } from './Signals';
import { Tasks } from './Tasks';
import { RepDetail, Team } from './Team';
import { StoreDetail, Stores } from './Stores';
import { Analytics } from './Analytics';
import { Plans } from './Plans';
import { Equipment, FreezerDetail } from './Equipment';
import { Debts, Deliveries } from './Ops';
import { Admin } from './Admin';
import { Profile } from './Profile';

interface NavDef { to: string; label: string; icon: string; roles: Role[]; section?: string; count?: 'signals' | 'tasks' }
const ALL: Role[] = ['admin', 'manager', 'warehouse', 'accounting'];
const NAV: NavDef[] = [
  { to: '/app', label: 'Обзор', icon: 'home', roles: ALL },
  { to: '/app/signals', label: 'Сигналы', icon: 'bolt', roles: ['admin', 'manager', 'warehouse', 'accounting'], count: 'signals' },
  { to: '/app/tasks', label: 'Задачи', icon: 'checklist', roles: ALL, count: 'tasks' },
  { to: '/app/team', label: 'Команда', icon: 'people', roles: ['admin', 'manager'], section: 'Продажи' },
  { to: '/app/stores', label: 'Торговые точки', icon: 'store', roles: ['admin', 'manager', 'warehouse', 'accounting'] },
  { to: '/app/analytics', label: 'Аналитика', icon: 'chart', roles: ['admin', 'manager'] },
  { to: '/app/plans', label: 'Планы и премии', icon: 'target', roles: ['admin', 'manager'] },
  { to: '/app/equipment', label: 'Оборудование', icon: 'freezer', roles: ['admin', 'manager', 'warehouse'], section: 'Операции' },
  { to: '/app/deliveries', label: 'Поставки', icon: 'truck', roles: ['admin', 'manager', 'warehouse'] },
  { to: '/app/debts', label: 'Дебиторка', icon: 'wallet', roles: ['admin', 'manager', 'accounting'] },
  { to: '/app/admin', label: 'Администрирование', icon: 'shield', roles: ['admin'], section: 'Компания' },
];

export function useNavCounts() {
  const s = useHub();
  return useMemo(() => {
    const ws = s.ws!;
    const role = s.user!.role;
    const signals = Object.values(ws.signals).filter((x) => x.status === 'new' || x.status === 'in_progress').filter((x) => role === 'admin' || role === 'manager' || x.hypotheses.some((h) => h.dept === role)).length;
    const tasks = ws.tasks.filter((t) => t.status !== 'done' && (role === 'admin' || role === 'manager' ? true : t.dept === role)).length;
    return { signals, tasks };
  }, [s]);
}

export default function DeskApp() {
  const s = useHub();
  const user = s.user!;
  const ws = s.ws!;
  const counts = useNavCounts();
  const loc = useLocation();
  const nav = useNavigate();
  const [bell, setBell] = useState(false);
  const notices = hub.myNotices();
  const unread = notices.filter((n) => !n.readBy.includes(user.id)).length;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  useEffect(() => { document.body.classList.remove('rep-mode'); }, []);
  useEffect(() => { if (user.mustChangePassword && !s.impersonator && !loc.pathname.endsWith('/profile')) nav('/app/profile'); }, [user.mustChangePassword, s.impersonator, loc.pathname, nav]);

  const isOn = (to: string) => (to === '/app' ? loc.pathname === '/app' || loc.pathname === '/app/' : loc.pathname.startsWith(to));
  const mobileTabs = items.filter((i) => ['/app', '/app/signals', '/app/tasks', '/app/stores', '/app/team'].includes(i.to)).slice(0, 4);

  return (
    <>
      {s.impersonator && (
        <div className="imp-bar">
          <Icon name="eye" size={16} /> Режим просмотра: {user.name} ({ROLE_LABEL[user.role]}) — действия фиксируются в журнале
          <button className="btn sm" onClick={() => hub.stopImpersonation()}>Вернуться</button>
        </div>
      )}
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><Logo size={30} /><span className="brand-name">DairyHub</span></div>
          {items.map((n) => (
            <div key={n.to}>
              {n.section && <div className="nav-sep">{n.section}</div>}
              <NavLink to={n.to} end={n.to === '/app'} className={() => `nav-item ${isOn(n.to) ? 'on' : ''}`}>
                <Icon name={n.icon} size={19} />
                {n.label}
                {n.count && counts[n.count] > 0 && <span className="count">{counts[n.count]}</span>}
              </NavLink>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <NavLink to="/app/profile" className={() => `nav-item ${isOn('/app/profile') ? 'on' : ''}`} style={{ height: 'auto', padding: 8 }}>
            <Avatar name={user.name} size="sm" />
            <span style={{ minWidth: 0 }}>
              <div className="t-foot bold ellipsis">{user.name}</div>
              <div className="t-cap ellipsis" style={{ opacity: 0.7 }}>{ROLE_LABEL[user.role]}</div>
            </span>
          </NavLink>
        </aside>
        <div className="main">
          <header className="topbar glass">
            <div className="row gap8" style={{ minWidth: 0 }}>
                            <b className="ellipsis t-headline">{ws.company}</b>
              {ws.demo && <span className="demo-pill hide-sm">Демо-данные</span>}
            </div>
            <div style={{ flex: 1 }} />
            <button className="icon-btn" onClick={() => setBell(true)} aria-label="Уведомления">
              <Icon name="bell" size={19} />
              {unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button className="icon-btn" onClick={() => hub.logout()} aria-label="Выйти" title="Выйти"><Icon name="logout" size={18} /></button>
          </header>
          <main className="content fade-in" key={loc.pathname}>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="signals" element={<Signals />} />
              <Route path="signals/:id" element={<SignalDetail />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="team" element={<RoleGate roles={['admin', 'manager']}><Team /></RoleGate>} />
              <Route path="team/:id" element={<RoleGate roles={['admin', 'manager']}><RepDetail /></RoleGate>} />
              <Route path="stores" element={<Stores />} />
              <Route path="stores/:id" element={<StoreDetail />} />
              <Route path="analytics" element={<RoleGate roles={['admin', 'manager']}><Analytics /></RoleGate>} />
              <Route path="plans" element={<RoleGate roles={['admin', 'manager']}><Plans /></RoleGate>} />
              <Route path="equipment" element={<RoleGate roles={['admin', 'manager', 'warehouse']}><Equipment /></RoleGate>} />
              <Route path="equipment/:id" element={<RoleGate roles={['admin', 'manager', 'warehouse']}><FreezerDetail /></RoleGate>} />
              <Route path="deliveries" element={<RoleGate roles={['admin', 'manager', 'warehouse']}><Deliveries /></RoleGate>} />
              <Route path="debts" element={<RoleGate roles={['admin', 'manager', 'accounting']}><Debts /></RoleGate>} />
              <Route path="admin" element={<RoleGate roles={['admin']}><Admin /></RoleGate>} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <nav className="tabbar glass mobile-tabbar" aria-label="Навигация">
        {mobileTabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/app'} className={() => `tab ${isOn(n.to) ? 'on' : ''}`}>
            <Icon name={n.icon} />
            {n.label === 'Торговые точки' ? 'Точки' : n.label}
            {n.count && counts[n.count] > 0 && <span className="count">{counts[n.count]}</span>}
          </NavLink>
        ))}
        <NavLink to="/app/profile" className={() => `tab ${isOn('/app/profile') || isOn('/app/admin') ? 'on' : ''}`}><Icon name="person" />Ещё</NavLink>
      </nav>
      <NoticeSheet open={bell} onClose={() => setBell(false)} base="/app" />
    </>
  );
}

function RoleGate({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const s = useHub();
  if (!roles.includes(s.user!.role)) return <Empty icon="lock" title="Нет доступа" text="Раздел недоступен для вашей роли. Обратитесь к администратору." />;
  return children;
}

export function NoticeSheet({ open, onClose, base }: { open: boolean; onClose: () => void; base: string }) {
  const s = useHub();
  const nav = useNavigate();
  const list = hub.myNotices().slice(0, 60);
  const uid = s.user!.id;
  return (
    <Sheet open={open} onClose={onClose} title="Уведомления">
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="t-foot sec">Сигналы, задачи и напоминания</span>
        <button className="btn sm" onClick={() => hub.markRead(list.map((n) => n.id))}>Прочитать все</button>
      </div>
      {list.length === 0 ? <Empty icon="bell" title="Уведомлений нет" /> : (
        <div className="list">
          {list.map((n) => {
            const unread = !n.readBy.includes(uid);
            return (
              <button key={n.id} className="cell" onClick={() => { void hub.markRead([n.id]); onClose(); if (n.link) nav(base + n.link); }}>
                <span className="cell-icon" style={{ background: n.kind === 'signal' ? 'var(--orange)' : n.kind === 'task' ? 'var(--blue)' : n.kind === 'reminder' ? 'var(--indigo)' : 'var(--gray)' }}>
                  <Icon name={n.kind === 'signal' ? 'bolt' : n.kind === 'task' ? 'checklist' : n.kind === 'reminder' ? 'clock' : 'info'} size={16} />
                </span>
                <div className="cell-main">
                  <div className="cell-title" style={{ fontWeight: unread ? 600 : 400 }}>{n.title}</div>
                  <div className="cell-sub">{n.body}</div>
                  <div className="t-cap ter mt4">{relTime(n.t)}</div>
                </div>
                {unread && <span className="dot" style={{ background: 'var(--blue)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
