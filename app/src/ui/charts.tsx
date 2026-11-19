import { useEffect, useMemo, useRef, useState } from 'react';
import { moneyShort } from '../lib/format';

export interface Series {
  name: string;
  values: number[];
  color: string;
  dashed?: boolean;
  area?: boolean;
}

/** Line chart with hover crosshair + tooltip (Apple Health / Stocks style). */
export function LineChart({ series, labels, height = 240, format = moneyShort }: { series: Series[]; labels: string[]; height?: number; format?: (n: number) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 8, r: 56, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = labels.length;
  const max = useMemo(() => Math.max(1, ...series.flatMap((s) => s.values)) * 1.1, [series]);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => max * k);
  const step = Math.ceil(n / Math.max(3, Math.floor(W / 90)));
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="График">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--sep)" strokeWidth={0.5} strokeDasharray={i ? '2 4' : undefined} vectorEffect="non-scaling-stroke" />
            <text x={W - pad.r + 8} y={y(t) + 4} fontSize={11} fill="var(--label-2)">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 6} fontSize={11} fill="var(--label-2)" textAnchor="middle">{l}</text> : null))}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
          return (
            <g key={s.name}>
              {s.area && <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.4} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--label-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="var(--bg-2)" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="glass" style={{ position: 'absolute', top: 4, left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 80px), calc(100% - 180px))`, padding: '8px 12px', borderRadius: 12, fontSize: 12, boxShadow: 'var(--glass-shadow)', pointerEvents: 'none', minWidth: 160 }}>
          <div className="sec" style={{ marginBottom: 4 }}>{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="row between gap8">
              <span className="row gap4"><span className="dot" style={{ background: s.color }} />{s.name}</span>
              <b className="num">{format(s.values[hover] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
      <div className="row gap16 wrap mt8 t-foot sec">
        {series.map((s) => (
          <span key={s.name} className="row gap4"><span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, opacity: s.dashed ? 0.6 : 1 }} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = 'var(--blue)', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / Math.max(1, max - min)) * (height - 4)).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Columns chart (e.g. daily sales). */
export function Columns({ values, labels, color = 'var(--blue)', height = 160, highlightFrom, format = moneyShort }: { values: number[]; labels: string[]; color?: string; height?: number; highlightFrom?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  const [h, setH] = useState<number | null>(null);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }} onPointerLeave={() => setH(null)}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i]}: ${format(v)}`} onPointerEnter={() => setH(i)} style={{ flex: 1, height: `${Math.max(2, (v / max) * 100)}%`, borderRadius: 4, background: highlightFrom !== undefined && i >= highlightFrom ? 'var(--red)' : color, opacity: h === null || h === i ? 1 : 0.45, transition: 'opacity .15s' }} />
        ))}
      </div>
      <div className="row between t-cap2 sec mt4">
        <span>{labels[0]}</span>
        <span className="num bold" style={{ color: 'var(--label)' }}>{h !== null ? `${labels[h]} · ${format(values[h])}` : ''}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

/** Apple Activity-style concentric rings for plan tiers (80 / 100 / 120 %). */
export function PlanRings({ value, size = 150 }: { value: number; size?: number }) {
  const rings = [
    { target: 1.2, color: '#ff2d55', bg: 'rgba(255,45,85,.18)' },
    { target: 1.0, color: '#34c759', bg: 'rgba(52,199,89,.18)' },
    { target: 0.8, color: '#0a84ff', bg: 'rgba(10,132,255,.18)' },
  ];
  const sw = size * 0.1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Выполнение ${Math.round(value * 100)}%`}>
      {rings.map((r, i) => {
        const rad = size / 2 - sw / 2 - i * (sw + 3);
        const c = 2 * Math.PI * rad;
        const p = Math.min(1, value / r.target);
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.bg} strokeWidth={sw} />
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }} />
          </g>
        );
      })}
    </svg>
  );
}

export function HBar({ items, format = moneyShort }: { items: { label: string; value: number; color?: string; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="col gap8">
      {items.map((it) => (
        <div key={it.label}>
          <div className="row between t-foot"><span className="ellipsis">{it.label}{it.sub && <span className="sec"> · {it.sub}</span>}</span><b className="num">{format(it.value)}</b></div>
          <div className="bar mt4" style={{ height: 8 }}><i style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? 'var(--blue)' }} /></div>
        </div>
      ))}
    </div>
  );
}
