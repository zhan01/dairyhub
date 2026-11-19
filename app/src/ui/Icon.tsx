// SF Symbols–style line icons (24px grid, 1.8 stroke, rounded caps).
const P: Record<string, string> = {
  home: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v10.5h4.5v-6h4v6h4.5V9',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  bolt: 'M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z',
  check: 'M5 12.5 10 17.5 19.5 7',
  checklist: 'M4 6.5 5.5 8 8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5M11 7h9M11 13h9M11 19h9',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.3 3.3 0 0 1 0 6.3M18 14.8c2 .6 3.2 2.4 3.5 5.2',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3',
  store: 'M4 9.5V20h16V9.5M3 9.5 5 4h14l2 5.5M3 9.5c0 1.4 1.1 2.5 2.5 2.5S8 10.9 8 9.5c0 1.4 1.1 2.5 2.5 2.5S13 10.9 13 9.5h-2 2c0 1.4 1.1 2.5 2.5 2.5S18 10.9 18 9.5c0 1.4 1.1 2.5 2.5 2.5M10 20v-5h4v5',
  chart: 'M4 20h16M7 16.5V11M11.5 16.5V6.5M16 16.5v-4M20 16.5V9',
  trend: 'M3.5 17 9 11.5l4 4L20.5 8M15 8h5.5v5.5',
  trendDown: 'M3.5 7 9 12.5l4-4L20.5 16M15 16h5.5v-5.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
  snow: 'M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  freezer: 'M5 3.5h14v17H5zM5 10h14M8 6.5v1.5M8 13v3',
  thermo: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0zM12 9v7',
  truck: 'M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5V16h-7M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  tenge: 'M6 4.5h12M6 8h12M12 8v12',
  wallet: 'M3.5 7.5h15a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 7.5 15 4l1 3.5M16 14h.5',
  map: 'M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5zM9 4.5v13M15 6.5v13',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  location: 'M20.5 3.5 3.5 10.5l7 2.5 2.5 7z',
  camera: 'M3.5 8h4L9 5.5h6L16.5 8h4v11h-17zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  chevR: 'M9.5 5.5 16 12l-6.5 6.5',
  chevL: 'M14.5 5.5 8 12l6.5 6.5',
  chevD: 'M5.5 9.5 12 16l6.5-6.5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5l-5-5',
  alert: 'M12 3.5 2.5 20h19zM12 10v4.5M12 17.2v.3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.2',
  sparkles: 'M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.5z',
  shield: 'M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6zM8.5 12l2.5 2.5 4.5-5',
  key: 'M14.5 13a5 5 0 1 0-4.6-3L3.5 16.5V20H7v-2h2v-2h2l1.3-1.3a5 5 0 0 0 2.2.3zM16 7.5h.01',
  logout: 'M14 4.5H5.5v15H14M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5',
  doc: 'M6 3h8l4.5 4.5V21H6zM14 3v4.5h4.5M9 12.5h6M9 16h6',
  flag: 'M5 21V4M5 4.5h11l-2 4 2 4H5',
  route: 'M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 16.5H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5',
  box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
  arrowR: 'M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  lock: 'M6 10.5h12V20H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bag: 'M5 8h14l-1 12.5H6zM9 8V6.5a3 3 0 0 1 6 0V8',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8M12 7.5V12l3 2',
  play: 'M7 4.5v15l12-7.5z',
  building: 'M4.5 20.5V5l8-2v17.5M12.5 8.5h7v12M7.5 8h2M7.5 12h2M7.5 16h2M15.5 12h1.5M15.5 16h1.5M2.5 20.5h19',
  filter: 'M3.5 5h17l-6.5 8v6l-4 1.5V13z',
  minus: 'M5 12h14',
  refresh: 'M20 11.5A8 8 0 0 0 5.6 7M4 12.5A8 8 0 0 0 18.4 17M5 3.5V7.5h4M19 20.5v-4h-4',
};

export function Icon({ name, size = 20, stroke = 1.8, className, style }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string; style?: React.CSSProperties }) {
  const d = P[name] ?? P.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="DairyHub">
      <defs>
        <linearGradient id="dhg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3D9BFF" />
          <stop offset="1" stopColor="#0A5FD6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#dhg)" />
      <path d="M24 14h16v6l5 8v20a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V28l5-8z" fill="#fff" />
      <path d="M19 36c5-3 9 3 13 0s8-3 13 0v12a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z" fill="#BFDDFF" />
      <rect x="24" y="12" width="16" height="4" rx="1.5" fill="#fff" />
    </svg>
  );
}
