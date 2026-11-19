import { useEffect, useState } from 'react';
import { hub, visitsToday } from '../../api/hub';
import { shiftSummary } from '../../domain/track';
import { fmtTime } from '../../lib/date';
import { haversine } from '../../lib/geo';
import { num1 } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Sheet, Switch, useAction, useHub } from '../../ui/kit';

/** Background collector: runs while a shift is active (real GPS or demo simulation). */
export function ShiftTracker() {
  const s = useHub();
  const sh = s.user ? hub.activeShift() : undefined;
  const active = !!sh;
  const sim = !!sh?.simulated;

  // real GPS
  useEffect(() => {
    if (!active || sim || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => void hub.addTrackPoint(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, sim]);

  // keep the screen awake during a shift so the browser keeps tracking
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === 'visible') lock = await wl.request('screen');
      } catch { /* not supported or denied */ }
    };
    void req();
    const onVis = () => { if (document.visibilityState === 'visible') void req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, [active]);

  // demo GPS: drive along today's route
  useEffect(() => {
    if (!active || !sim) return;
    const tick = () => {
      const cur = hub.activeShift();
      const ws = hub.state.ws;
      if (!cur || !ws) return;
      const vs = visitsToday(cur.repId);
      const next = vs.find((v) => v.status === 'in_progress') ?? vs.find((v) => v.status === 'planned');
      const st = next ? ws.stores.find((x) => x.id === next.storeId) : undefined;
      if (!st) return;
      const last = cur.points[cur.points.length - 1];
      const from: [number, number] = last ? [last[0], last[1]] : [st.lat - 0.009, st.lng - 0.008];
      const d = haversine(from[0], from[1], st.lat, st.lng);
      const step = 110;
      let lat = st.lat + (Math.random() - 0.5) * 0.0002;
      let lng = st.lng + (Math.random() - 0.5) * 0.0002;
      if (d > step) {
        const f = step / d;
        lat = from[0] + (st.lat - from[0]) * f;
        lng = from[1] + (st.lng - from[1]) * f;
      }
      void hub.addTrackPoint(lat, lng, 10 + Math.random() * 10);
    };
    tick();
    const i = setInterval(tick, 6000);
    return () => clearInterval(i);
  }, [active, sim]);
  return null;
}

export function ShiftCard() {
  const s = useHub();
  const { run, busy } = useAction();
  const [sim, setSim] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(i); }, []);
  const sh = hub.activeShift();
  const ended = s.ws!.shifts.filter((x) => x.repId === s.user!.id && x.date === s.today && x.endAt).pop();

  if (sh) {
    const sum = shiftSummary(sh);
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="row gap12">
          <span className="cell-icon" style={{ background: 'var(--green)', width: 40, height: 40, borderRadius: 12 }}><Icon name="route" size={20} /></span>
          <div className="grow">
            <div className="row gap8"><b className="t-headline">Смена идёт</b><span className="dot" style={{ background: 'var(--green)', animation: 'fade 1s ease infinite alternate' }} /></div>
            <div className="t-foot sec">с {fmtTime(sh.startAt)} · {num1(sum.km)} км · {Math.floor(sum.hours)} ч {Math.round((sum.hours % 1) * 60)} мин{sh.simulated ? ' · демо-GPS' : ''}</div>
          </div>
          <button className="btn sm" onClick={() => setConfirmEnd(true)}>Завершить</button>
        </div>
        <div className="hint mt8">GPS-трек записывается только во время смены. Не закрывайте вкладку — браузер не пишет трек в фоне.</div>
        <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="Завершить смену?">
          <div className="col gap16">
            <div className="t-sub sec">Пройдено {num1(sum.km)} км, остановок {sum.stops.length}. После завершения запись геолокации прекратится.</div>
            <button className="btn primary lg block" disabled={busy} onClick={async () => { await run(() => hub.endShift(), 'Смена завершена'); setConfirmEnd(false); }}>Завершить смену</button>
          </div>
        </Sheet>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row gap12">
        <span className="cell-icon" style={{ background: ended ? 'var(--gray)' : 'var(--blue)', width: 40, height: 40, borderRadius: 12 }}><Icon name="route" size={20} /></span>
        <div className="grow">
          <b className="t-headline">{ended ? 'Смена завершена' : 'Рабочая смена'}</b>
          <div className="t-foot sec">{ended ? `${fmtTime(ended.startAt)}–${fmtTime(ended.endAt!)} · ${num1(shiftSummary(ended).km)} км` : 'Начните смену, чтобы записывать маршрут'}</div>
        </div>
        {!ended && <button className="btn primary sm" disabled={busy} onClick={() => run(() => hub.startShift(sim), 'Смена начата, GPS-трек включён')}>Начать</button>}
      </div>
      {!ended && (
        <div className="row between mt12">
          <span className="t-foot sec">Демо-GPS (движение по маршруту)</span>
          <Switch checked={sim} onChange={setSim} label="Демо-GPS" />
        </div>
      )}
      {!ended && <div className="hint mt8">Нажимая «Начать», вы соглашаетесь на запись геолокации только в рабочее время.</div>}
    </div>
  );
}
