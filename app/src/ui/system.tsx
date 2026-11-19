import { useEffect, useState } from 'react';
import { hub } from '../api/hub';
import { Icon } from './Icon';
import { Switch, useHub, useToast } from './kit';

const PREF = 'dh:pref:browser-notify';
const seenKey = (uid: string) => `dh:notified:${uid}`;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

/** FR-018: tells the user when the network is gone; data keeps being saved on the device. */
export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="imp-bar" style={{ background: 'var(--orange)' }}><Icon name="alert" size={16} />Нет сети — работа продолжается, данные сохраняются на устройстве</div>;
}

/** FR-080: system (browser) notifications for new DairyHub notices, when the user allowed them. */
export function BrowserNotifier() {
  const s = useHub();
  useEffect(() => {
    const u = s.user;
    if (!u || get(PREF) !== '1' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const since = Number(get(seenKey(u.id)) ?? Date.now());
    const fresh = hub.myNotices().filter((n) => n.t > since && !n.readBy.includes(u.id)).slice(0, 3);
    for (const n of fresh) {
      try { new Notification(`DairyHub · ${n.title}`, { body: n.body, icon: './icon.svg', tag: n.id }); } catch { /* not allowed in this context */ }
    }
    set(seenKey(u.id), String(Date.now()));
  }, [s.version, s.user]);
  return null;
}

export function NotificationSettings() {
  const toast = useToast();
  const supported = typeof Notification !== 'undefined';
  const [on, setOn] = useState(get(PREF) === '1' && supported && Notification.permission === 'granted');
  const toggle = async (v: boolean) => {
    if (!v) { set(PREF, '0'); setOn(false); return; }
    if (!supported) { toast('Браузер не поддерживает системные уведомления', true); return; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('Разрешение не выдано — включите уведомления в настройках браузера', true); return; }
    set(PREF, '1');
    const uid = hub.state.user?.id;
    if (uid) set(seenKey(uid), String(Date.now()));
    setOn(true);
    toast('Системные уведомления включены');
  };
  return (
    <div className="list">
      <div className="cell"><div className="cell-main"><div className="cell-title">В приложении</div><div className="cell-sub">Критичные сигналы нельзя отключить</div></div><span className="badge green">Всегда</span></div>
      <div className="cell"><div className="cell-main"><div className="cell-title">Уведомления браузера</div><div className="cell-sub">Всплывающие уведомления на телефоне и компьютере</div></div><Switch checked={on} onChange={(v) => void toggle(v)} label="Уведомления браузера" /></div>
      <div className="cell"><div className="cell-main"><div className="cell-title">Telegram-бот</div><div className="cell-sub">Требует серверной части</div></div><span className="badge">Промышленная версия</span></div>
      <div className="cell"><div className="cell-main"><div className="cell-title">SMS для критичных</div><div className="cell-sub">Требует SMS-шлюза</div></div><span className="badge">Промышленная версия</span></div>
    </div>
  );
}
