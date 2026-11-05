/**
 * Colorado Parks and Wildlife "Draw Recap" report (primary draw, one per species and year), parsed from the
 * positions of the PDF's text items. Text order alone breaks: cells wrap onto two lines ("165 of" / "181") and a
 * hunt's table continues onto the next page. Every hunt code gets one header page (quotas, caps, "drawn out at")
 * and then rows of applicants and successful applicants by preference points, for six pools:
 * adult resident / nonresident, youth resident / nonresident, landowner (LPP) unrestricted / restricted.
 *
 * Pure: takes the pages' text items, returns hunts plus any problems found. The row-total check (point rows must
 * add up to "Total Choice 1") is what tells us the columns were read right.
 */

/** One text item; y is measured from the top of the page. */
export interface Item { s: string; x: number; y: number }

export const POOLS = ['res', 'nr', 'yres', 'ynr', 'lppu', 'lppr'] as const;
export type Pool = (typeof POOLS)[number];
export type PoolCounts = Record<Pool, number>;

export interface Cutoff {
  /** CPW's words: "6 Pref Points", "Choice 2", "Leftover Choice 1", "None Drawn". */
  text: string;
  /** Preference points at the level the quota ran out, when it ran out among first choices. */
  points: number | null;
  /** The choice it ran out at, when that was a 2nd-4th choice (first choices all drew). */
  choice: number | null;
  leftover: boolean;
  drawnAtLevel: number | null;
  appsAtLevel: number | null;
}

export interface RecapHunt {
  year: number;
  species: string; // DEER | ELK | ...
  code: string; // DM070O3R
  list: string | null; // A / B / C
  quota: number | null;
  generalQuota: number | null;
  lppUnres: number | null;
  lppRes: number | null;
  youthPrefPct: number | null;
  youthPref: number | null;
  nrCapPct: number | null;
  nrCap: number | null;
  hybridPct: number | null;
  hybridCap: number | null;
  /** First-choice .. fourth-choice applications: [general draw, landowner]. */
  apps: [number, number][];
  drawnTotal: number | null;
  balance: number | null;
  drawn: PoolCounts;
  cutoff: Partial<Record<Pool, Cutoff>>;
  /** First-choice applicants and successful applicants by preference points: pool -> points -> count. */
  pre: Record<Pool, Record<number, number>>;
  post: Record<Pool, Record<number, number>>;
  /** "Total Choice 1..4" rows of both tables: [choice][pool]. */
  preTotals: number[][];
  postTotals: number[][];
  pages: number[];
  problems: string[];
  /** Saw the table's Grand Total row: later pages without a hunt code aren't this hunt's. */
  closed?: boolean;
}

// D/E = deer/elk; sex M/F/E (P on the point-only code DP99999P); unit; season letter + number; method
const CODE = /^([DE])([MFEP])(\d{3})([A-Z0-9])(\d)([A-Z])$/;
// column centers (x) in CPW's template; items are assigned to the nearest within TOL
const LEFT = [180, 216, 253, 289, 330, 375];
const RIGHT = [560, 597, 633, 670, 710, 755];
const CUT = [557, 593, 629, 665, 706, 751];
const TOL = 20;

const num = (s: string): number | null => {
  const t = s.replace(/,/g, '').trim();
  if (t === '-') return 0;
  return /^\d+$/.test(t) ? Number(t) : null;
};
const pct = (s: string): number | null => (/^\d+(\.\d+)?%$/.test(s.trim()) ? Number(s.trim().slice(0, -1)) : null);
const nearest = (x: number, centers: number[]) => {
  let best = -1, d = TOL + 1;
  centers.forEach((c, i) => {
    if (Math.abs(c - x) < d) { d = Math.abs(c - x); best = i; }
  });
  return best;
};
const emptyPools = <T>(f: () => T): Record<Pool, T> => Object.fromEntries(POOLS.map((p) => [p, f()])) as Record<Pool, T>;

/** Items grouped into rows (same baseline within 3 points), top to bottom, each left to right. */
export function rowsOf(items: Item[]): Item[][] {
  const sorted = items.filter((i) => i.s.trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= 3) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function parseCutoffText(text: string): Pick<Cutoff, 'points' | 'choice' | 'leftover'> {
  // a two-digit level can come out as two items ("1" "8 Pref Points" = 18)
  const t = text.replace(/\s+/g, ' ').trim().replace(/(\d) (?=\d)/g, '$1');
  const p = /(\d+) Pref Points?/i.exec(t);
  const c = /Choice (\d)/i.exec(t);
  return { points: p ? Number(p[1]) : null, choice: !p && c ? Number(c[1]) : null, leftover: /Leftover/i.test(t) };
}

function headerInfo(pages: Item[][]) {
  for (const items of pages.slice(0, 3)) {
    const t = items.map((i) => i.s).join(' ');
    const m = /(\d{4}) (?:Primary|Secondary) (\w+) Post Draw Report/i.exec(t);
    if (m) return { year: Number(m[1]), species: m[2].toUpperCase() };
  }
  return null;
}

/** The hunt code on a hunt's header page (the left-hand "# Drawn / Hunt Code / List" box), if this page has one. */
function pageCode(items: Item[]): { code: string; list: string | null; y: number } | null {
  const c = items.find((i) => i.x < 200 && CODE.test(i.s.trim()));
  if (!c) return null;
  const list = items.find((i) => Math.abs(i.y - c.y) <= 3 && i.x > c.x + 20 && i.x < c.x + 90 && /^[A-Z]$/.test(i.s.trim()));
  return { code: c.s.trim(), list: list?.s.trim() ?? null, y: c.y };
}

function parseHeader(items: Item[], h: RecapHunt) {
  const rows = rowsOf(items);
  const find = (re: RegExp, xmin = 0, xmax = 9999) => items.find((i) => re.test(i.s.trim()) && i.x >= xmin && i.x <= xmax);
  const at = (y: number, xmin: number, xmax: number, tol = 3) => items.filter((i) => Math.abs(i.y - y) <= tol && i.x >= xmin && i.x <= xmax);
  const first = (y: number, xmin: number, xmax: number, f: (s: string) => number | null, tol = 3) => {
    for (const i of at(y, xmin, xmax, tol)) {
      const v = f(i.s);
      if (v !== null) return v;
    }
    return null;
  };

  // regulation levels: label, then % at x~290 and number at x~358 on the same row
  const reg = (re: RegExp): [number | null, number | null] => {
    const l = find(re);
    return l ? [first(l.y, 270, 310, pct), first(l.y, 335, 380, num)] : [null, null];
  };
  [, h.lppUnres] = reg(/^LPP Unrestricted/i);
  [, h.lppRes] = reg(/^LPP Restricted/i);
  [h.youthPrefPct, h.youthPref] = reg(/^Youth Preference/i);
  [h.nrCapPct, h.nrCap] = reg(/^NonResident Cap/i);
  [h.hybridPct, h.hybridCap] = reg(/^Hybrid Draw/i);

  // quota row: under the "Original / General Draw" header
  const orig = find(/^Original$/, 440, 520);
  if (orig) {
    const below = rows.find((r) => r[0].y > orig.y + 4 && r[0].y < orig.y + 30 && r.some((i) => i.x >= 460 && i.x <= 500 && num(i.s) !== null));
    if (below) {
      const v = (xmin: number, xmax: number) => below.find((i) => i.x >= xmin && i.x <= xmax && num(i.s) !== null);
      h.quota = num(v(460, 500)?.s ?? '') ?? null;
      h.generalQuota = num(v(500, 540)?.s ?? '') ?? null;
      if (h.lppUnres === null) h.lppUnres = num(v(690, 725)?.s ?? '') ?? null;
      if (h.lppRes === null) h.lppRes = num(v(735, 775)?.s ?? '') ?? null;
    }
  }

  // applications by choice: "Total Choice N" at x~207, general at x~290, landowner at x~358
  for (const l of items.filter((i) => /^Total Choice [1-4]$/.test(i.s.trim()) && i.x > 180 && i.x < 240)) {
    const c = Number(l.s.trim().slice(-1)) - 1;
    h.apps[c] = [first(l.y, 265, 320, num) ?? 0, first(l.y, 335, 380, num) ?? 0];
  }

  // post-draw totals: "# Drawn  Balance  Res  NonRes ..." header, values on the next row
  const bal = items.find((i) => i.s.trim() === 'Balance' && i.x > 490 && i.x < 530);
  if (bal) {
    const vals = rows.find((r) => r[0].y > bal.y + 4 && r[0].y < bal.y + 25 && r.some((i) => i.x >= 465 && i.x <= 495 && num(i.s) !== null));
    if (vals) {
      h.drawnTotal = num(vals.find((i) => i.x >= 465 && i.x <= 495)?.s ?? '') ?? null;
      h.balance = num(vals.find((i) => i.x >= 505 && i.x <= 535)?.s ?? '') ?? null;
      for (const i of vals) {
        const k = i.x > 540 ? nearest(i.x, RIGHT) : -1;
        const v = num(i.s);
        if (k >= 0 && v !== null) h.drawn[POOLS[k]] = v;
      }
    }
  }

  // drawn out at / # drawn at final level: cells can wrap onto two lines, so take a band around the label
  const dl = find(/^Drawn Out At$/i, 440, 560);
  const fl = find(/^# Drawn at Final Level$/i, 440, 560);
  const band = (y: number) => {
    const cols: Item[][] = POOLS.map(() => []);
    for (const i of items) {
      if (i.x < 540 || Math.abs(i.y - y) > 9) continue;
      const k = nearest(i.x, CUT);
      if (k >= 0) cols[k].push(i);
    }
    return cols.map((c) => c.sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim());
  };
  if (dl) {
    const texts = band(dl.y);
    const finals = fl ? band(fl.y) : POOLS.map(() => '');
    POOLS.forEach((p, k) => {
      if (!texts[k]) return;
      const m = /(\d+) of (\d+)/.exec(finals[k]);
      h.cutoff[p] = { text: texts[k], ...parseCutoffText(texts[k]), drawnAtLevel: m ? Number(m[1]) : null, appsAtLevel: m ? Number(m[2]) : null };
    });
  }
}

/** Point rows and Total Choice rows of the two lower tables (header page below "Pre-Draw Applicants", or any continuation page). */
function parseTables(items: Item[], h: RecapHunt, fromY: number) {
  for (const row of rowsOf(items)) {
    if (row[0].y < fromY) continue;
    for (const [side, centers, ptMin, ptMax, totMin, totMax] of [
      ['pre', LEFT, 95, 150, 60, 110],
      ['post', RIGHT, 480, 530, 440, 490],
    ] as const) {
      const xs = side === 'pre' ? [0, 430] : [430, 800];
      const part = row.filter((i) => i.x >= xs[0] && i.x < xs[1]);
      const tot = part.find((i) => /^Total Choice [1-4]$/.test(i.s.trim()) && i.x >= totMin && i.x <= totMax);
      const pt = part.find((i) => i.x >= ptMin && i.x <= ptMax && /^\d+$/.test(i.s.trim()));
      const vals: (number | null)[] = POOLS.map(() => null);
      for (const i of part) {
        if (i === pt || i === tot) continue;
        const k = nearest(i.x, centers);
        const v = num(i.s);
        if (k >= 0 && v !== null) vals[k] = v;
      }
      if (side === 'pre' && part.some((i) => /^Grand Total$/i.test(i.s.trim()))) h.closed = true;
      if (vals.every((v) => v === null)) continue;
      if (tot) {
        const c = Number(tot.s.trim().slice(-1)) - 1;
        (side === 'pre' ? h.preTotals : h.postTotals)[c] = vals.map((v) => v ?? 0);
      } else if (pt) {
        const p = Number(pt.s.trim());
        const into = side === 'pre' ? h.pre : h.post;
        POOLS.forEach((pool, k) => {
          if (vals[k]) into[pool][p] = vals[k]!;
        });
      }
    }
  }
}

function check(h: RecapHunt) {
  for (const side of ['pre', 'post'] as const) {
    const tot = (side === 'pre' ? h.preTotals : h.postTotals)[0];
    if (!tot) { h.problems.push(`${side}: no Total Choice 1 row`); continue; }
    POOLS.forEach((p, k) => {
      const sum = Object.values(h[side][p]).reduce((a, b) => a + b, 0);
      if (sum !== tot[k]) h.problems.push(`${side} ${p}: point rows add to ${sum}, Total Choice 1 says ${tot[k]}`);
    });
  }
  if (h.quota === null) h.problems.push('no quota');
}

/** Every hunt in one Draw Recap report. `pages`: text items per page, y from the top. */
export function parseRecap(pages: Item[][]): { year: number; species: string; hunts: RecapHunt[] } {
  const info = headerInfo(pages);
  if (!info) throw new Error('Not a CPW Draw Recap report (no "<year> Primary/Secondary <SPECIES> Post Draw Report" header)');
  const hunts: RecapHunt[] = [];
  let cur: RecapHunt | null = null;
  pages.forEach((items, idx) => {
    const c = pageCode(items);
    if (c) {
      if (cur) check(cur);
      cur = {
        year: info.year, species: info.species, code: c.code, list: c.list,
        quota: null, generalQuota: null, lppUnres: null, lppRes: null, youthPrefPct: null, youthPref: null,
        nrCapPct: null, nrCap: null, hybridPct: null, hybridCap: null,
        apps: [[0, 0], [0, 0], [0, 0], [0, 0]], drawnTotal: null, balance: null,
        drawn: emptyPools(() => 0), cutoff: {}, pre: emptyPools(() => ({})), post: emptyPools(() => ({})),
        preTotals: [], postTotals: [], pages: [idx + 1], problems: [],
      };
      hunts.push(cur);
      parseHeader(items, cur);
      const tablesFrom = items.find((i) => /^Pre-Draw Applicants$/i.test(i.s.trim()))?.y ?? 0;
      parseTables(items, cur, tablesFrom);
    } else if (cur && !(cur as RecapHunt).closed) {
      (cur as RecapHunt).pages.push(idx + 1);
      parseTables(items, cur, 0);
    }
  });
  if (cur) check(cur);
  for (const h of hunts) delete h.closed;
  return { ...info, hunts };
}

/** Decodes a CPW hunt code: DM070O3R = deer, antlered (M), unit 70, season O3, rifle. */
export function decodeHuntCode(code: string) {
  const m = CODE.exec(code);
  if (!m) return null;
  const [, sp, sex, unit, seasonType, seasonNo, method] = m;
  return {
    species: sp === 'D' ? 'DEER' : 'ELK',
    sex: sex as 'M' | 'F' | 'E' | 'P', // antlered / antlerless / either sex; P = preference point only
    unit: String(Number(unit)),
    seasonType, // O = regular season; others (E, L, P, W, J, K, U...) are special seasons: see the brochure
    seasonNo: Number(seasonNo),
    method: method as string, // R rifle, A archery, M muzzleloader, X other
  };
}
