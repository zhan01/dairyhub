/** FR-083: export any table to XLSX (SheetJS loaded on demand) with CSV fallback. */
export type Cell = string | number | null | undefined;

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCSV(head: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export async function exportTable(name: string, head: string[], rows: Cell[][]) {
  const safe = name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(48, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DairyHub');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safe}.xlsx`);
  } catch {
    download(new Blob(['﻿' + toCSV(head, rows)], { type: 'text/csv;charset=utf-8' }), `${safe}.csv`);
  }
}
