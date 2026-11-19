import { useMemo, useState } from 'react';
import { personName } from '../../api/hub';
import { shiftSummary } from '../../domain/track';
import { addDays, fmtDayShort, fmtTime, fmtWeekday } from '../../lib/date';
import { num1 } from '../../lib/format';
import { exportTable } from '../../lib/exporter';
import { Icon } from '../../ui/Icon';
import { MapView, type MapLine, type MapPoint } from '../../ui/MapView';
import { Card, Empty, Seg, useHub } from '../../ui/kit';
import { storeName } from './common';

/** FR: GPS track of a rep's working shift with visits, stops and mileage. */
export function TrackCard({ repId }: { repId: string }) {
  const s = useHub();
  const ws = s.ws!;
  const days = Array.from({ length: 7 }, (_, i) => addDays(s.today, -i));
  const [day, setDay] = useState(s.today);
  const sh = ws.shifts.filter((x) => x.repId === repId && x.date === day).pop();
  const data = useMemo(() => {
    if (!sh) return null;
    const sum = shiftSummary(sh);
    const visits = ws.visits.filter((v) => v.repId === repId && v.date === day);
    const points: MapPoint[] = visits.map((v) => {
      const st = ws.stores.find((x) => x.id === v.storeId)!;
      return { id: v.id, lat: st.lat, lng: st.lng, color: v.status === 'done' ? '#30d158' : v.status === 'missed' || (v.status === 'planned' && day < s.today) ? '#ff453a' : '#8e8e93', label: v.status === 'done' ? '✓' : '', popup: `<b>${st.name}</b><br/>${v.checkIn ? `Визит ${fmtTime(v.checkIn.t)}${v.checkOutAt ? `–${fmtTime(v.checkOutAt)}` : ''}` : v.status === 'missed' ? 'Пропущен' : 'По плану'}` };
    });
    const first = sh.points[0];
    const last = sh.points[sh.points.length - 1];
    if (first) points.push({ id: 'start', lat: first[0], lng: first[1], color: '#0a84ff', label: 'S', popup: `Начало смены ${fmtTime(sh.startAt)}` });
    if (last && !sh.endAt) points.push({ id: 'now', lat: last[0], lng: last[1], color: '#bf5af2', label: '●', popup: `Последняя позиция ${fmtTime(last[2])}` });
    const lines: MapLine[] = [{ points: sh.points.map((p) => [p[0], p[1]] as [number, number]), color: '#0a84ff' }];
    const notAtStore = sum.stops.filter((st) => !ws.stores.some((x) => Math.hypot((x.lat - st.lat) * 111000, (x.lng - st.lng) * 81000) < 120));
    return { sum, points, lines, visits, notAtStore };
  }, [sh, ws, repId, day, s.today, s.version]);

  const exportTrack = () => {
    if (!sh) return;
    void exportTable(`dairyhub-gps-${personName(repId)}-${day}`, ['Время', 'Широта', 'Долгота', 'Точность, м'], sh.points.map((p) => [new Date(p[2]).toLocaleTimeString('ru-RU'), p[0], p[1], p[3]]));
  };

  return (
    <Card title={<div className="row gap8"><Icon name="route" size={18} className="c-blue" /><h3 style={{ margin: 0 }}>GPS-трек смены</h3></div>} action={<div className="row gap8">{sh && <button className="btn sm" onClick={exportTrack}><Icon name="doc" size={14} />Excel</button>}</div>}>
      <Seg value={day} onChange={setDay} options={days.map((d) => ({ value: d, label: d === s.today ? 'Сегодня' : `${fmtWeekday(d)} ${fmtDayShort(d)}` }))} />
      {!sh || !data ? <Empty icon="route" title="Смена не начиналась" text="Трек записывается только между «Начать смену» и «Завершить смену»" /> : (
        <>
          <div className="grid g4 mt12" style={{ gap: 12 }}>
            <div><div className="t-cap sec">Пробег</div><div className="t-title3">{num1(data.sum.km)} км</div></div>
            <div><div className="t-cap sec">Смена</div><div className="t-title3">{fmtTime(sh.startAt)}–{sh.endAt ? fmtTime(sh.endAt) : 'идёт'}</div></div>
            <div><div className="t-cap sec">Остановки</div><div className="t-title3">{data.sum.stops.length}</div></div>
            <div><div className="t-cap sec">Точек GPS</div><div className="t-title3">{sh.points.length}</div></div>
          </div>
          <div className="mt12" style={{ borderRadius: 16, overflow: 'hidden' }}><MapView height={380} points={data.points} lines={data.lines} /></div>
          <div className="row gap16 wrap t-foot sec mt8">
            <span><span className="dot" style={{ background: '#0a84ff' }} /> трек</span><span><span className="dot" style={{ background: '#30d158' }} /> визит выполнен</span><span><span className="dot" style={{ background: '#ff453a' }} /> пропущен</span><span><span className="dot" style={{ background: '#bf5af2' }} /> текущая позиция</span>
            {sh.simulated && <span className="badge orange">демо-GPS</span>}
          </div>
          {data.notAtStore.length > 0 && <div className="info-box t-foot mt12">Остановки вне торговых точек: {data.notAtStore.map((x) => `${fmtTime(x.from)} (${Math.round(x.minutes)} мин)`).join(', ')}. Это не нарушение — повод уточнить у сотрудника.</div>}
          <div className="list mt12">
            {data.visits.map((v) => <div key={v.id} className="cell"><div className="cell-main"><div className="cell-title">{storeName(v.storeId)}</div><div className="cell-sub">{v.checkIn ? `${fmtTime(v.checkIn.t)}${v.checkOutAt ? `–${fmtTime(v.checkOutAt)}` : ''} · ${v.checkIn.distance} м от точки` : v.status === 'missed' ? 'Нет GPS-отметки' : 'По плану'}</div></div><span className={`badge ${v.status === 'done' ? 'green' : v.status === 'missed' ? 'red' : ''}`}>{v.status === 'done' ? 'Выполнен' : v.status === 'missed' ? 'Пропущен' : v.status === 'in_progress' ? 'Идёт' : 'План'}</span></div>)}
          </div>
        </>
      )}
    </Card>
  );
}

/** Live map: last known position of every rep with an active shift. */
export function TeamLiveMap() {
  const s = useHub();
  const ws = s.ws!;
  const active = ws.shifts.filter((x) => x.date === s.today && !x.endAt && x.points.length);
  const points: MapPoint[] = active.map((x) => {
    const p = x.points[x.points.length - 1];
    const name = personName(x.repId);
    return { id: x.repId, lat: p[0], lng: p[1], color: '#bf5af2', label: name.split(' ').map((w) => w[0]).join(''), popup: `<b>${name}</b><br/>обновлено ${fmtTime(p[2])} · ${num1(shiftSummary(x).km)} км за смену` };
  });
  const lines: MapLine[] = active.map((x) => ({ points: x.points.map((p) => [p[0], p[1]] as [number, number]), color: 'rgba(10,132,255,.55)' }));
  return (
    <Card title={<div className="row gap8"><Icon name="location" size={18} className="c-blue" /><h3 style={{ margin: 0 }}>Команда на карте</h3></div>} action={<span className="t-foot sec">на смене: {active.length}</span>}>
      {active.length === 0 ? <Empty icon="location" title="Сейчас никто не на смене" /> : <div style={{ borderRadius: 16, overflow: 'hidden' }}><MapView height={360} points={points} lines={lines} /></div>}
    </Card>
  );
}
