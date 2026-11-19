import { Link } from 'react-router-dom';
import { hub, personName } from '../../api/hub';
import type { Signal, Task } from '../../domain/types';
import { DEPT_LABEL, SIGNAL_LABEL, SIGNAL_STATUS_LABEL } from '../../domain/types';
import { fmtDateTime, relTime } from '../../lib/date';
import { Icon } from '../../ui/Icon';
import { SEV_ICON, STATUS_BADGE } from '../../ui/kit';

export const storeName = (id?: string) => (id ? hub.state.ws?.stores.find((s) => s.id === id)?.name ?? '—' : '—');

export function SignalRow({ s, base = '/app' }: { s: Signal; base?: string }) {
  return (
    <Link to={`${base}/signals/${encodeURIComponent(s.id)}`} className="sig">
      <span className={`sev ${s.severity}`}><Icon name={SEV_ICON[s.type]} size={17} /></span>
      <div className="grow">
        <div className="row between gap8">
          <span className="t-sub bold" style={{ minWidth: 0 }}>{s.title}</span>
          <span className="t-cap ter" style={{ whiteSpace: 'nowrap' }}>{relTime(s.detectedAt)}</span>
        </div>
        <div className="t-foot sec mt4" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.summary}</div>
        <div className="row gap4 wrap mt8">
          <span className={`badge ${STATUS_BADGE[s.status]}`}>{SIGNAL_STATUS_LABEL[s.status]}</span>
          <span className="badge">{SIGNAL_LABEL[s.type]}</span>
          {s.hypotheses[0] && s.hypotheses[0].confidence !== 'low' && <span className="badge indigo"><Icon name="sparkles" size={11} />{s.hypotheses[0].title}</span>}
          {s.taskIds.length > 0 && <span className="badge blue">→ {[...new Set(s.taskIds.map((id) => hub.state.ws!.tasks.find((t) => t.id === id)?.dept).filter(Boolean))].map((d) => DEPT_LABEL[d!]).join(', ')}</span>}
        </div>
      </div>
    </Link>
  );
}

export function taskState(t: Task) {
  if (t.status === 'done') return { label: 'Выполнена', cls: 'green' };
  if (t.dueAt < Date.now()) return { label: 'Просрочена', cls: 'red' };
  if (t.dueAt - Date.now() < 6 * 3600000) return { label: 'Срок сегодня', cls: 'orange' };
  return { label: t.status === 'in_progress' ? 'В работе' : 'Открыта', cls: t.status === 'in_progress' ? 'blue' : 'gray' };
}

export function TaskLine({ t, onClick }: { t: Task; onClick?: () => void }) {
  const st = taskState(t);
  return (
    <button className="cell" onClick={onClick}>
      <span className="cell-icon" style={{ background: t.status === 'done' ? 'var(--green)' : t.dept === 'warehouse' ? 'var(--teal)' : t.dept === 'accounting' ? 'var(--purple)' : t.dept === 'rep' ? 'var(--orange)' : 'var(--blue)' }}>
        <Icon name={t.status === 'done' ? 'check' : t.dept === 'warehouse' ? 'truck' : t.dept === 'accounting' ? 'wallet' : t.dept === 'rep' ? 'person' : 'flag'} size={16} />
      </span>
      <div className="cell-main">
        <div className="cell-title ellipsis" style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined, color: t.status === 'done' ? 'var(--label-2)' : undefined }}>{t.title}</div>
        <div className="cell-sub ellipsis">{DEPT_LABEL[t.dept]}{t.assigneeId ? ` · ${personName(t.assigneeId)}` : ''} · срок {fmtDateTime(t.dueAt)}</div>
      </div>
      <span className={`badge ${st.cls}`}>{st.label}</span>
      <Icon name="chevR" size={16} className="chev" />
    </button>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-h">
      <div>
        <h1 className="t-large">{title}</h1>
        {sub && <div className="t-sub sec mt4">{sub}</div>}
      </div>
      {actions && <div className="row gap8 wrap">{actions}</div>}
    </div>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return <Link to={to} className="row gap4 t-sub" style={{ marginBottom: 8 }}><Icon name="chevL" size={16} />{label}</Link>;
}
