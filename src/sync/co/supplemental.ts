/** Supplemental CPW reports kept separately from primary point-odds data. */
import { POOLS, parseCutoffText, rowsOf, type Item, type Cutoff } from './recap';
export interface DrawnOutRow {
  code: string;
  list: string | null;
  cutoff: Partial<Record<(typeof POOLS)[number], Cutoff>>;
}
export interface SalesRow {
  code: string;
  res: number;
  nr: number;
  yres: number;
  ynr: number;
  total: number;
}
export function parseDrawnOut(pages: Item[][]): DrawnOutRow[] {
  const result: DrawnOutRow[] = [];
  for (const items of pages) {
    const codes = items.filter((i) => /^[DEA][MFEP]\d{3}[A-Z0-9]\d[A-Z]$/.test(i.s.trim()) && i.x < 130);
    const centers = [340, 374, 408, 442, 480, 527];
    for (const code of codes) {
      const label = items
        .filter((i) => /^Drawn Out At$/i.test(i.s.trim()) && Math.abs(i.y - code.y) < 23)
        .sort((a, b) => Math.abs(a.y - code.y) - Math.abs(b.y - code.y))[0];
      if (!label) continue;
      const final = items.find((i) => /^# Drawn at Final Level$/i.test(i.s.trim()) && i.y > label.y && i.y < label.y + 28);
      const textAt = (y: number, k: number) =>
        items
          .filter(
            (i) =>
              i.x > 310 &&
              Math.abs(i.y - y) < 9 &&
              centers.findIndex((c, j) => Math.abs(i.x - c) === Math.min(...centers.map((x) => Math.abs(i.x - x)))) === k,
          )
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((i) => i.s.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      const cutoff: DrawnOutRow['cutoff'] = {};
      POOLS.forEach((pool, k) => {
        const text = textAt(label.y, k),
          m = final ? /(\d[\d,]*) of (\d[\d,]*)/.exec(textAt(final.y, k)) : null;
        if (text)
          cutoff[pool] = {
            text,
            ...parseCutoffText(text),
            drawnAtLevel: m ? Number(m[1].replace(/,/g, '')) : null,
            appsAtLevel: m ? Number(m[2].replace(/,/g, '')) : null,
          };
      });
      result.push({
        code: code.s.trim(),
        list: items.find((i) => /^[ABC]$/.test(i.s.trim()) && i.x > 130 && i.x < 165 && Math.abs(i.y - code.y) < 10)?.s.trim() ?? null,
        cutoff,
      });
    }
  }
  return result;
}
export function parseOtcSales(pages: Item[][]): SalesRow[] {
  const result: SalesRow[] = [];
  for (const page of pages)
    for (const row of rowsOf(page)) {
      const code = row.find((i) => /^[DEA][MFEP]\d{3}[A-Z0-9]\d[A-Z]$/.test(i.s.trim()));
      if (!code) continue;
      const n = row.filter((i) => i.x > code.x && /^[\d,]+$/.test(i.s.trim())).map((i) => Number(i.s.replace(/,/g, '')));
      if (n.length !== 5 || n.slice(0, 4).reduce((a, b) => a + b, 0) !== n[4]) continue;
      result.push({ code: code.s.trim(), res: n[0], nr: n[1], yres: n[2], ynr: n[3], total: n[4] });
    }
  return result;
}
