import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hub } from '../api/hub';
import { initials } from '../lib/format';
import { Icon } from './Icon';

export function useHub() {
  return useSyncExternalStore((l) => hub.subscribe(l), () => hub.state);
}

// ---------- toast ----------
type ToastT = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, err }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast glass ${t.err ? 'err' : ''}`}>
            <Icon name={t.err ? 'alert' : 'check'} size={18} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an async action with error toast + busy flag */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', true);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { run, busy };
}

// ---------- primitives ----------
export function Card({ title, action, children, className = '', pad0 }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad0?: boolean }) {
  return (
    <section className={`card ${pad0 ? 'pad0' : ''} ${className}`}>
      {(title || action) && (
        <div className="card-h" style={pad0 ? { padding: '18px 20px 0' } : undefined}>
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, foot, icon, color = 'var(--blue)' }: { label: string; value: ReactNode; foot?: ReactNode; icon?: string; color?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">
        {icon && <span className="cell-icon" style={{ width: 24, height: 24, borderRadius: 7, background: color }}><Icon name={icon} size={14} stroke={2.2} /></span>}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, full }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`seg ${full ? 'full' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

const AV_COLORS = ['#ff9500', '#34c759', '#007aff', '#af52de', '#ff2d55', '#5856d6', '#30b0c7', '#a2845e'];
export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  const c = AV_COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV_COLORS.length];
  return <div className={`avatar ${size ?? ''}`} style={{ background: `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 75%, #000))` }}>{initials(name)}</div>;
}

export function Bar({ value, color, ticks }: { value: number; color?: string; ticks?: number[] }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      {ticks?.map((t) => <span key={t} className="tick" style={{ left: `${t * 100}%` }} />)}
    </div>
  );
}

export function Empty({ icon = 'check', title, text }: { icon?: string; title: string; text?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} stroke={1.5} />
      <div className="t-headline" style={{ color: 'var(--label)' }}>{title}</div>
      {text && <div className="t-foot mt4">{text}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div className="grabber" />
        {title && (
          <div className="sheet-h">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon name="x" size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Загрузка" />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(0, value - 1))} aria-label="Меньше">−</button>
      <span>{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label="Больше">+</button>
    </div>
  );
}

export const SEV_ICON: Record<string, string> = {
  missed_visit: 'pin', sales_drop: 'trendDown', rep_drop: 'person', freezer_no_sales: 'snow', freezer_missing: 'freezer', temperature: 'thermo', report_missing: 'doc', plan_risk: 'target', relocation: 'route',
};
export const CONF_LABEL: Record<string, string> = { high: 'Высокая вероятность', medium: 'Средняя вероятность', low: 'Низкая вероятность' };
export const STATUS_BADGE: Record<string, string> = { new: 'red', in_progress: 'orange', monitoring: 'blue', resolved: 'green', dismissed: 'gray' };
