/**
 * CPW Chapter W-2 (big game regulations): which game management units each hunt code covers, its licenses and
 * its season dates. Parsed from text positions like the Draw Recap (src/sync/co/recap.ts).
 *
 * Hunt-code tables put the unit list in the left column, either on every row or once per group (vertically
 * centered on the group's rows), sometimes wrapped over two lines, sometimes as a description ("That portion of
 * GMU 6 above 10,000 feet..."). A code's own unit number is the first unit of its group, so each code takes the
 * nearest left-column cell that contains its unit. Dates are either on the code's row (that year's only) or in a
 * table over the section (rifle seasons by year, muzzleloader by year, archery "annually").
 */
import type { Item } from './recap';
import { rowsOf } from './recap';

export interface DateRange {
  start: string;
  end: string;
} // ISO yyyy-mm-dd
export interface CodeDates {
  /** Dates printed on the code's row: one year's, or "annually" (MM-DD). */
  row: { start: string; end: string; annual: boolean } | null;
  /** The section table above the code: by year (rifle seasons 1-4 / muzzleloader) or annual (archery). */
  table: { byYear?: Record<number, DateRange>; annual?: { start: string; end: string } } | null;
}

export interface RegCode {
  code: string;
  units: string[];
  /** Only part of the units (a wilderness, above timberline, private land...): `unitText` says which part. */
  partial: boolean;
  unitText: string;
  /** The unit list wasn't found: units = [the code's own unit]. */
  guessed: boolean;
  licenses: number | null;
  dates: CodeDates;
  section: string | null;
  page: number;
}

const CODE = /^[DEA][MFE]\d{3}[A-Z0-9]\d[A-Z]$/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const CONT_END = /(,|\b(and|of|the|except|within|above|below|in|north|south|east|west|to|by|portions?|that|those|GMUs?))$/i;
const RANGE = /(\d{2})\/(\d{2})(?:\/\s*(\d{4}))?\s*[-–]\s*(\d{2})\/(\d{2})(?:\/\s*(\d{4}))?(\s*annually)?/i;

/** GMU numbers in a unit cell: "4, 14, 214, 441" -> [4, 14, 214, 441]; skips dates, elevations ("10,000 feet") and years. */
export function unitsIn(text: string): string[] {
  const t = text
    // road numbers in boundary descriptions ("bounded by Colo 291 and US 50")
    .replace(
      /\b(Colo\.?|Colorado|US|U\.S\.|Hwy\.?|Highway|CR|County Road|Road|Rd\.?|I|Interstate|SH|FR|FS Road|Forest Road|Trail)\s*[-#]?\s*\d+[A-Z]?\b/gi,
      ' ',
    )
    .replace(/\d{1,2}\/\d{1,2}(\/\s*\d{2,4})?/g, ' ')
    .replace(/\d{1,3},\d{3}/g, ' ')
    .replace(/\b\d+\s*(feet|ft)\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ');
  const out: string[] = [];
  for (const m of t.matchAll(/\b(\d{1,3})\b/g)) if (!out.includes(String(Number(m[1])))) out.push(String(Number(m[1])));
  return out;
}

interface Cell {
  text: string;
  y: number;
  units: string[];
}

/** Left-column unit cells on a page, wrapped lines joined. */
function cellsOf(items: Item[], colMax: number): Cell[] {
  const lines = rowsOf(items)
    .map((r) => r.filter((i) => i.x < colMax && !/^\d{2}\/\d{2}/.test(i.s.trim())))
    .filter((r) => r.length && r[0].x >= 60 && r[0].x <= 100)
    .map((r) => ({
      text: r
        .map((i) => i.s.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      y: r[0].y,
    }))
    .filter((l) => l.text && !/^(Unit\(s\)|Year|License|TOTAL|#\d|[A-Z]\.|\d+\.)/.test(l.text));
  const cells: { text: string; ys: number[] }[] = [];
  for (const l of lines) {
    const prev = cells[cells.length - 1];
    if (prev && l.y - prev.ys[prev.ys.length - 1] <= 12 && (CONT_END.test(prev.text) || /^[a-z]/.test(l.text))) {
      prev.text += ` ${l.text}`;
      prev.ys.push(l.y);
    } else cells.push({ text: l.text, ys: [l.y] });
  }
  return cells
    .map((c) => ({ text: c.text, y: c.ys.reduce((a, b) => a + b, 0) / c.ys.length, units: unitsIn(c.text) }))
    .filter((c) => c.units.length);
}

const isoMD = (m: string, d: string) => `${m}-${d}`;

function rowDatesOf(items: Item[], ci: Item): CodeDates['row'] {
  // on the code's own line (either side of it): "10/24/2026 - 11/01/2026", "09/01 - 11/30 annually"
  const same = items.filter((i) => i !== ci && Math.abs(i.y - ci.y) <= 3).sort((a, b) => a.x - b.x);
  const m = RANGE.exec(same.map((i) => i.s.trim()).join(' '));
  if (m) {
    const [, m1, d1, y1, m2, d2, y2, ann] = m;
    if (ann || (!y1 && !y2)) return { start: isoMD(m1, d1), end: isoMD(m2, d2), annual: true };
    const ye = y2 ?? y1!,
      ys = y1 ?? (Number(m1) > Number(m2) ? String(Number(ye) - 1) : ye);
    return { start: `${ys}-${m1}-${d1}`, end: `${ye}-${m2}-${d2}`, annual: false };
  }
  // "09/01 - 10/31" just above the code's line and "annually" just below
  const stack = items
    .filter((i) => i !== ci && Math.abs(i.y - ci.y) <= 8 && i.x > 150 && !/^\d+$/.test(i.s.trim()))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const ma = RANGE.exec(stack.map((i) => i.s.trim()).join(' '));
  if (ma?.[7]) return { start: isoMD(ma[1], ma[2]), end: isoMD(ma[4], ma[5]), annual: true };
  // stacked in a dates column: start just above the code's line, end just below
  const ds = items.filter((i) => DATE.test(i.s.trim()) && Math.abs(i.y - ci.y) <= 12 && Math.abs(i.x - ci.x) < 260 && i.x > 150);
  const above = ds.filter((i) => i.y < ci.y - 1).sort((a, b) => b.y - a.y)[0];
  const below = ds.filter((i) => i.y > ci.y + 1).sort((a, b) => a.y - b.y)[0];
  if (above && below && Math.abs(above.x - below.x) < 15) {
    const iso = (t: string) => `${t.slice(6, 10)}-${t.slice(0, 2)}-${t.slice(3, 5)}`;
    if (iso(above.s.trim()) <= iso(below.s.trim())) return { start: iso(above.s.trim()), end: iso(below.s.trim()), annual: false };
  }
  return null;
}

export function parseRegs(pages: Item[][]): { codes: Record<string, RegCode>; year: number | null } {
  const codes: Record<string, RegCode> = {};
  let section: string | null = null;
  // the section's date table in force (reset at each new section)
  let rifle: Record<number, [string, string][]> = {};
  let muzzle: Record<number, DateRange> = {};
  let annual: { start: string; end: string } | null = null;
  let prevCells: Cell[] = [];
  let regYear: number | null = null;
  const iso = (mdY: string) => `${mdY.slice(6, 10)}-${mdY.slice(0, 2)}-${mdY.slice(3, 5)}`;

  pages.forEach((items, idx) => {
    const rows = rowsOf(items);
    const rowText = (r: Item[]) =>
      r
        .map((i) => i.s.trim())
        .join(' ')
        .replace(/\s+/g, ' ');
    const all = rows.map(rowText).join(' ');
    const ly = /Licenses\s*\(\s*(20\d)\s*(\d)\s*\)/.exec(all) ?? /Licenses\s*\(\s*(20\d\d)\s*\)/.exec(all);
    if (ly) regYear = Number(ly[1].length === 4 ? ly[1] : ly[1] + ly[2]);

    type Ev = { y: number; run: () => void };
    const ev: Ev[] = [];
    for (const r of rows) {
      const t = rowText(r);
      const sec = /^#(2\d\d)\b/.exec(t);
      if (sec && r[0].x < 100)
        ev.push({
          y: r[0].y,
          run: () => {
            section = `#${sec[1]}`;
            rifle = {};
            muzzle = {};
            annual = null;
          },
        });
    }
    // archery: "Season Dates:" then "09/02 – 09/30 Annually" (same line or the next)
    rows.forEach((r, k) => {
      const t = `${rowText(r)} ${rows[k + 1] ? rowText(rows[k + 1]) : ''}`;
      if (!/Season Dates/i.test(rowText(r))) return;
      const ann = /Season Dates:?\s*(\d{2})\/(\d{2})\s*[–-]\s*(\d{2})\/(\d{2})\s*Annually/i.exec(t);
      if (ann)
        ev.push({
          y: r[0].y,
          run: () => {
            annual = { start: isoMD(ann[1], ann[2]), end: isoMD(ann[3], ann[4]) };
          },
        });
    });
    // muzzleloader: "License year 2025 2026 ..." then a row of starts and a row of ends
    rows.forEach((r, k) => {
      if (!/^License year/i.test(rowText(r))) return;
      const years = r.filter((i) => /^20\d\d$/.test(i.s.trim())).map((i) => ({ y: Number(i.s.trim()), x: i.x }));
      const starts = rows[k + 1]?.filter((i) => DATE.test(i.s.trim())) ?? [];
      const ends = rows[k + 2]?.filter((i) => DATE.test(i.s.trim())) ?? [];
      const m: Record<number, DateRange> = {};
      for (const yr of years) {
        const s0 = starts.find((i) => Math.abs(i.x - yr.x) < 30),
          e0 = ends.find((i) => Math.abs(i.x - yr.x) < 30);
        if (s0 && e0) m[yr.y] = { start: iso(s0.s.trim()), end: iso(e0.s.trim()) };
      }
      if (Object.keys(m).length)
        ev.push({
          y: r[0].y,
          run: () => {
            muzzle = m;
          },
        });
    });
    // rifle seasons 1-4: a year label at the left with its four ranges (starts above / ends below, or on its line)
    rows.forEach((r) => {
      const yl = r.find((i) => i.x < 110 && /^20\d\d$/.test(i.s.trim()));
      if (!yl) return;
      const dates = rows.filter((rr) => Math.abs(rr[0].y - yl.y) <= 8).flatMap((rr) => rr.filter((i) => DATE.test(i.s.trim())));
      if (dates.length < 8) return;
      const starts = dates.filter((d) => d.y < yl.y - 1).sort((a, b) => a.x - b.x);
      const ends = dates.filter((d) => d.y > yl.y + 1).sort((a, b) => a.x - b.x);
      let ranges: [string, string][] = [];
      if (starts.length >= 4 && ends.length >= 4) ranges = starts.slice(0, 4).map((s0, n) => [s0.s.trim(), ends[n].s.trim()]);
      else {
        const same = dates.filter((u) => Math.abs(u.y - yl.y) <= 3).sort((a, b) => a.x - b.x);
        for (let n = 0; n + 1 < same.length; n += 2) ranges.push([same[n].s.trim(), same[n + 1].s.trim()]);
      }
      if (ranges.length >= 4)
        ev.push({
          y: yl.y - 5,
          run: () => {
            rifle = { ...rifle, [Number(yl.s.trim())]: ranges.slice(0, 4) };
          },
        });
    });

    // Unlimited license unit cells can span two hunt codes or continue across a page.
    const unitLimit = Math.min(...items.filter((i) => CODE.test(i.s.trim())).map((i) => i.x)) - 4;
    const otcLines = rowsOf(items)
      .map((r) =>
        r.filter((i) => i.x >= 60 && i.x < unitLimit && !/^(Antlered|Antlerless|Either[- ]?Sex|Either|Unlimited)$/i.test(i.s.trim())),
      )
      .filter((r) => r.length && r[0].x >= 70 && r[0].x <= 95)
      .map((r) => ({ y: r[0].y, text: r.map((i, n) => n && /^\d/.test(i.s.trim()) && /\d$/.test(r[n - 1].s.trim()) && i.x - r[n - 1].x < 15 ? i.s.trim() : (n ? ' ' : '') + i.s.trim()).join('') }))
      .filter((r) => /^(\d{1,3}\b|\(|Oso\b|SWA\b|[a-z])/.test(r.text));
    const otcGroups: { ys: number[]; text: string }[] = [];
    for (const line of otcLines) {
      const previous = otcGroups.at(-1);
      if (previous && line.y - previous.ys.at(-1)! <= 14) {
        previous.ys.push(line.y);
        previous.text += ' ' + line.text;
      } else otcGroups.push({ ys: [line.y], text: line.text });
    }
    const codeItems = items.filter((i) => CODE.test(i.s.trim()));
    const colMax = codeItems.length ? Math.min(...codeItems.map((i) => i.x)) - 4 : 0;
    const cells = codeItems.length ? cellsOf(items, colMax) : [];
    for (const ci of codeItems) {
      ev.push({
        y: ci.y,
        run: () => {
          const code = ci.s.trim();
          const own = String(Number(code.slice(2, 5)));
          const pick = (cs: Cell[], dy: (c: Cell) => number) => cs.filter((c) => c.units.includes(own)).sort((a, b) => dy(a) - dy(b))[0];
          const group =
            code[5] === 'U' && own === '0'
              ? otcGroups
                  .slice()
                  .sort((a, b) => Math.max(a.ys[0] - ci.y, ci.y - a.ys.at(-1)!, 0) - Math.max(b.ys[0] - ci.y, ci.y - b.ys.at(-1)!, 0))[0]
              : undefined;
          const cell = group
            ? { text: group.text, units: unitsIn(group.text), y: group.ys[0] }
            : (pick(cells, (c) => Math.abs(c.y - ci.y)) ?? pick(prevCells, (c) => -c.y));
          const lic = items.find((i) => Math.abs(i.y - ci.y) <= 3 && i.x > ci.x + 40 && /^\d[\d,]*$/.test(i.s.trim()));
          const method = code.slice(-1),
            type = code[5],
            no = Number(code[6]);
          let table: CodeDates['table'] = null;
          if (method === 'A' && annual) table = { annual };
          else if (method === 'M' && Object.keys(muzzle).length) table = { byYear: muzzle };
          else if (method === 'R' && ['O', 'K', 'S', 'U'].includes(type) && Object.keys(rifle).length)
            table = {
              byYear: Object.fromEntries(
                Object.entries(rifle)
                  .filter(([, v]) => v[no - 1])
                  .map(([y, v]) => [Number(y), { start: iso(v[no - 1][0]), end: iso(v[no - 1][1]) }]),
              ),
            };
          codes[code] = {
            code,
            units: cell ? cell.units : [own],
            partial:
              !!cell && /portion|except|within|above|below|bounded|north of|south of|east of|west of|private land|only/i.test(cell.text),
            unitText: cell?.text ?? '',
            guessed: !cell,
            licenses: lic ? Number(lic.s.replace(/,/g, '')) : null,
            dates: { row: rowDatesOf(items, ci), table },
            section,
            page: idx + 1,
          };
        },
      });
    }
    ev.sort((a, b) => a.y - b.y).forEach((e) => e.run());
    if (cells.length) prevCells = cells;
  });
  for (let idx = 1; idx < pages.length; idx++) {
    const previous = Object.values(codes)
      .filter((c) => c.page === idx && c.code[5] === 'U' && /,$/.test(c.unitText))
      .at(-1);
    if (!previous) continue;
    const nextCodeY = Math.min(...pages[idx].filter((i) => CODE.test(i.s.trim())).map((i) => i.y));
    const continuation = rowsOf(pages[idx])
      .map((r) => r.filter((i) => i.x >= 60 && i.x < 250 && i.y < nextCodeY - 10))
      .filter((r) => r.length && r[0].x >= 70 && r[0].x <= 95 && /^\d{1,3},/.test(r[0].s.trim()))
      .flatMap((r) => r.map((i) => i.s.trim()))
      .join(' ');
    if (continuation) {
      previous.unitText += ' ' + continuation;
      previous.units = unitsIn(previous.unitText);
    }
  }
  applyPronghornDates(pages, codes);
  return { codes, year: regYear };
}

/** Pronghorn has its own archery, muzzleloader and rifle calendars, distinct from deer and elk. */
function applyPronghornDates(pages: Item[][], codes: Record<string, RegCode>) {
  const text = pages.map((p) => rowsOf(p).map((r) => r.map((i) => i.s.trim()).join(' ')).join(' '));
  const arch = pages.map((p) => p.map((i) => i.s.trim()).join(' ')).find((s) => /Unlimited Buck or Either\s*-?\s*Sex Season Dates:/i.test(s) && /Limited Doe Only Season Dates:/i.test(s));
  const archRange = (label: RegExp) => {
    const m = arch?.match(label);
    return m ? { start: `${m[1]}-${m[2]}`, end: `${m[3]}-${m[4]}` } : null;
  };
  const buck = archRange(/Limited Buck Only Season Dates:\s*(\d\d)\/(\d\d)\s*[-–]\s*(\d\d)\/(\d\d)\s+annually/i);
  const doe = archRange(/Limited Doe Only Season Dates:\s*(\d\d)\/(\d\d)\s*[-–]\s*(\d\d)\/(\d\d)\s+annually/i);
  const muzzlePage = text.find((s) => /09\/21\s*[-–]\s*09\/29\s+Annually/i.test(s) && /A[MF]\d{3}O1M/.test(s));
  const muzzleMatch = muzzlePage?.match(/Season Dates:\s*(\d\d)\/(\d\d)\s*[-–]\s*(\d\d)\/(\d\d)\s+Annually/i);
  const muzzle = muzzleMatch ? { start: `${muzzleMatch[1]}-${muzzleMatch[2]}`, end: `${muzzleMatch[3]}-${muzzleMatch[4]}` } : null;
  const ranges = (label: RegExp) => {
    const out: Record<number, DateRange> = {};
    const page = pages.find((p) => p.some((i) => label.test(i.s)) && p.some((i) => /^A[MFE]\d{3}/.test(i.s.trim())));
    const header = page?.find((i) => label.test(i.s));
    if (!page || !header) return out;
    for (const yr of page.filter((i) => /^20\d\d$/.test(i.s.trim()) && i.y > header.y && i.y < header.y + 100)) {
      const dates = page.filter((i) => DATE.test(i.s.trim()) && Math.abs(i.x - yr.x) < 5 && i.y > yr.y && i.y < yr.y + 60).sort((a, b) => a.y - b.y);
      const iso = (s: string) => `${s.slice(6, 10)}-${s.slice(0, 2)}-${s.slice(3, 5)}`;
      if (dates.length === 2) out[Number(yr.s)] = { start: iso(dates[0].s.trim()), end: iso(dates[1].s.trim()) };
    }
    return out;
  };
  const first = ranges(/Regular Rifle Season Dates, Units/);
  const second = ranges(/^Second$/);
  for (const c of Object.values(codes)) {
    if (!c.code.startsWith('A')) continue;
    // Do not reuse the previous species' table; code-specific dates still take precedence.
    c.dates.table = null;
    const sex = c.code[1], type = c.code[5], n = c.code[6], method = c.code[7];
    if (method === 'A' && (type === 'O' || type === 'U')) {
      const a = sex === 'F' ? doe : buck;
      if (a) c.dates.table = { annual: a };
    } else if (method === 'M' && type === 'O' && muzzle) c.dates.table = { annual: muzzle };
    else if (method === 'R' && type === 'O' && (n === '1' || n === '2')) {
      const years = n === '1' ? first : second;
      if (Object.keys(years).length) c.dates.table = { byYear: years };
    }
  }
}

/**
 * A code's season dates for `year` (ISO), and the year they're actually for: the row's own dates when they are for
 * that year or annual, else the section table's, else the latest dates known (the regulation year's).
 */
export function datesFor(c: Pick<RegCode, 'dates'>, year: number): (DateRange & { year: number }) | null {
  const { row, table } = c.dates;
  if (row?.annual) return { start: `${year}-${row.start}`, end: `${year}-${row.end}`, year };
  // a season's license year is the year it opens (12/01/2026 - 01/31/2027 is 2026's)
  if (row && Number(row.start.slice(0, 4)) === year) return { ...row, year };
  if (table?.annual) return { start: `${year}-${table.annual.start}`, end: `${year}-${table.annual.end}`, year };
  if (table?.byYear?.[year]) return { ...table.byYear[year], year };
  if (row) return { start: row.start, end: row.end, year: Number(row.start.slice(0, 4)) };
  return null;
}
