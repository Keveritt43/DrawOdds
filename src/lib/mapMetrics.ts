/** Unit shading shared by every map: what each metric means, its color ramp and how to print it. */

export type Sp = 'DEER' | 'ELK';
export interface MetricDef {
  label: string;
  field: (sp: Sp, nr: boolean) => string;
  ramp: string[];
  bySpecies?: boolean;
  fmt: (v: number) => string;
  none: string;
  note: string;
}
// light -> dark, single hue per meaning: green = land you can hunt, orange = success / odds, plum = crowding
export const GREEN = ['#eef4e6', '#d2e4bf', '#aecd92', '#84b267', '#5b9242', '#346c27'];
export const ORANGE = ['#fdeadc', '#fbcaa7', '#f7a474', '#f27c44', '#d85b18', '#9c3d0a'];
export const PLUM = ['#f4eaf2', '#e2c6dd', '#cb9ac4', '#af6ca7', '#8b4386', '#5f2260'];
export const NODATA = '#e0ddd5';
export const MATCH = '#f0641e';
export const ZONE = '#6a3fd6';
export const AREA = '#0f6e56';

const num = (v: number) => (v >= 10 ? String(Math.round(v)) : v >= 1 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(2))));
const pctOf = (v: number) => `${num(v)}%`;
export const fmtNum = num;

export type Metric = 'public' | 'huntable' | 'success' | 'pressure' | 'odds';
export const METRICS: Record<Metric, MetricDef> = {
  public: {
    label: 'Public Land %', field: () => 'publicPct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Federal + state land, from IDFG unit pages. Does not include Access Yes!.',
  },
  huntable: {
    label: 'Public + Access Yes! %', field: () => 'huntablePct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Public land plus private land enrolled in Access Yes! (open to hunting by agreement).',
  },
  success: {
    label: 'General Success %', bySpecies: true, ramp: ORANGE, fmt: pctOf, none: 'No general season / under 50 hunters',
    field: (sp: Sp) => (sp === 'ELK' ? 'genSuccessElk' : 'genSuccessDeer'),
    note: 'Harvest ÷ hunters, general seasons, all weapons, last 5 seasons (only seasons after a boundary change).',
  },
  pressure: {
    label: 'General Hunters / Sq Mi', bySpecies: true, ramp: PLUM, fmt: num, none: 'No general season',
    field: (sp: Sp) => (sp === 'ELK' ? 'huntersSqMiElk' : 'huntersSqMiDeer'),
    note: 'Average general-season hunters per year (all weapons) ÷ unit square miles. Darker = more crowded.',
  },
  odds: {
    label: 'Best Buck / Bull Draw Odds', ramp: ORANGE, fmt: (v: number) => pctOf(v * 100), none: 'No antlered controlled hunts',
    field: (_sp: Sp, nr: boolean) => (nr ? 'bestNrOdds' : 'bestResOdds'),
    note: 'Best 5-year first-choice odds of any adult antlered controlled hunt touching the unit, for your residency (antlerless and youth hunts left out).',
  },
};
export const METRIC_KEYS = Object.keys(METRICS) as Metric[];

export interface Classes { breaks: number[]; counts: number[] }

/** Spread n colors across a 6-color ramp, keeping the darkest. */
export const pickRamp = (ramp: string[], n: number) =>
  Array.from({ length: n }, (_, i) => ramp[n === 1 ? ramp.length - 1 : Math.round((i * (ramp.length - 1)) / (n - 1))]);

/** Every field a metric can read (for computing breaks client-side when the server didn't send them). */
export const METRIC_FIELDS = [...new Set(Object.values(METRICS).flatMap((x) => [x.field('DEER', false), x.field('ELK', false), x.field('DEER', true)]))];

/** MapLibre step expression for a metric's classes; units without a number get the no-data gray. */
export function fillExpression(field: string, cls: Classes, colors: string[]): unknown {
  const steps: (string | number)[] = [colors[0]];
  cls.breaks.forEach((b, i) => steps.push(b, colors[i + 1]));
  return cls.breaks.length
    ? ['case', ['!=', ['typeof', ['get', field]], 'number'], NODATA, ['step', ['get', field], ...steps]]
    : ['case', ['!=', ['typeof', ['get', field]], 'number'], NODATA, colors[0]];
}

/** Idaho's bounding box: maps open framed on the whole state, clear of the key in the corner. */
export const IDAHO_BOUNDS: [[number, number], [number, number]] = [[-117.25, 41.98], [-111.04, 49.0]];
