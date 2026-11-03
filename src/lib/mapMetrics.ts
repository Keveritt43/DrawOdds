import type { Classes, BreakMode } from './breaks';
import { benchmarkClasses, divergingClasses } from './breaks';
/** Unit shading shared by every map: what each metric means, its color ramp and how to print it. */

export type Sp = 'DEER' | 'ELK' | 'PRONGHORN' | 'MOOSE' | 'BIGHORN' | 'GOAT';
export type Kind = 'land' | 'general' | 'controlled';
export interface MetricDef {
  label: string;
  kind: Kind;
  field: (sp: Sp, nr: boolean) => string;
  ramp: string[];
  /** which end is good: crowding is better low */
  better?: 'high' | 'low';
  bySpecies?: boolean;
  fmt: (v: number) => string;
  none: string;
  note: string;
}
const SPK = (sp: Sp) => ({ DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn', GOAT: 'Goat' })[sp];
// light -> dark, single hue per meaning: green = land you can hunt, orange = success / odds, plum = crowding
export const GREEN = ['#eef4e6', '#d2e4bf', '#aecd92', '#84b267', '#5b9242', '#346c27'];
export const ORANGE = ['#fdeadc', '#fbcaa7', '#f7a474', '#f27c44', '#d85b18', '#9c3d0a'];
export const PLUM = ['#f4eaf2', '#e2c6dd', '#cb9ac4', '#af6ca7', '#8b4386', '#5f2260'];
export const NODATA = '#e0ddd5';
/** The site's map scale: 7 steps, red (worst) -> yellow (normal for Idaho) -> green (best). */
export const RYG7 = ['#b2182b', '#e0603f', '#f4a95c', '#f7e27a', '#b9dd80', '#66bd63', '#1a9850'];
/** Success rates are bell-shaped (SD steps); odds, crowding and land are lopsided (percentile steps). */
export const fieldMode = (field: string): BreakMode => (/success/i.test(field) ? 'sd' : 'pct');
/** Colors for diverging classes; `better: 'low'` flips the scale (fewer hunters = green). */
export const colorsFor = (cls: Classes, better: 'high' | 'low' = 'high') =>
  (cls.idx ?? cls.breaks.concat(0).map((_, i) => i)).map((i) => RYG7[better === 'low' ? 6 - i : i]);
export const MATCH = '#f0641e';
export const ZONE = '#6a3fd6';
export const AREA = '#0f6e56';

const num = (v: number) => (v >= 10 ? String(Math.round(v)) : v >= 1 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(2))));
const pctOf = (v: number) => `${num(v)}%`;
export const fmtNum = num;

export type Metric = 'public' | 'huntable' | 'success' | 'pressure' | 'ctlOdds' | 'ctlFill' | 'ctlSuccess';
export const METRICS: Record<Metric, MetricDef> = {
  public: {
    label: 'Public Land %', kind: 'land', field: () => 'publicPct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Federal + state land, from IDFG unit pages. Does not include Access Yes!.',
  },
  huntable: {
    label: 'Public + Access Yes! %', kind: 'land', field: () => 'huntablePct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Public land plus private land enrolled in Access Yes! (open to hunting by agreement).',
  },
  success: {
    label: 'General Season Success %', kind: 'general', bySpecies: true, ramp: ORANGE, fmt: pctOf, none: 'No general season / under 50 hunters',
    field: (sp) => (sp === 'ELK' ? 'genSuccessElk' : 'genSuccessDeer'),
    note: 'Harvest ÷ hunters, general seasons, all weapons, last 5 seasons (only seasons after a boundary change).',
  },
  pressure: {
    label: 'General Season Hunters / Sq Mi', kind: 'general', bySpecies: true, ramp: PLUM, better: 'low', fmt: num, none: 'No general season',
    field: (sp) => (sp === 'ELK' ? 'huntersSqMiElk' : 'huntersSqMiDeer'),
    note: 'Average general-season hunters per year (all weapons) ÷ unit square miles. Green = fewer hunters.',
  },
  ctlOdds: {
    label: 'Controlled Draw Odds (Best Male Hunt)', kind: 'controlled', bySpecies: true, ramp: ORANGE, fmt: (v: number) => pctOf(v * 100), none: 'No buck / bull controlled hunt',
    field: (sp, nr) => `ctlOdds${nr ? 'Nr' : 'Res'}${SPK(sp)}`,
    note: 'Best 5-year first-choice odds, for your residency, of any adult buck / bull / ram controlled hunt touching the unit (antlerless and youth hunts left out; mountain goat hunts are either sex).',
  },
  ctlFill: {
    label: 'Controlled Draw And Fill (Best Male Hunt)', kind: 'controlled', bySpecies: true, ramp: ORANGE, fmt: (v: number) => pctOf(v * 100), none: 'No buck / bull hunt, or too few hunters',
    field: (sp, nr) => `ctlFill${nr ? 'Nr' : 'Res'}${SPK(sp)}`,
    note: 'Draw odds × hunter success (5-year): the chance one application ends with an animal, for your residency. Best adult buck / bull / ram hunt touching the unit.',
  },
  ctlSuccess: {
    label: 'Controlled Hunt Success %', kind: 'controlled', bySpecies: true, ramp: ORANGE, fmt: pctOf, none: 'No buck / bull hunt, or too few hunters (50; 10 for moose, sheep, goat)',
    field: (sp) => `ctlSuccess${SPK(sp)}`,
    note: 'Harvest ÷ hunters over 5 years, all adult buck / bull controlled hunts touching the unit together (a hunt spanning several units counts in each).',
  },
};
export const METRIC_KEYS = Object.keys(METRICS) as Metric[];

export type { Classes } from './breaks';

/** Spread n colors across a 6-color ramp, keeping the darkest. */
export const pickRamp = (ramp: string[], n: number) =>
  Array.from({ length: n }, (_, i) => ramp[n === 1 ? ramp.length - 1 : Math.round((i * (ramp.length - 1)) / (n - 1))]);

/** Every field a metric can read (for computing breaks client-side when the server didn't send them). */
export const METRIC_FIELDS = [...new Set(Object.values(METRICS).flatMap((x) => (['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'] as Sp[]).flatMap((sp) => [x.field(sp, false), x.field(sp, true)])))];

/**
 * MapLibre step expression for a metric's classes; units without a number get the no-data gray. `value` is a
 * property name, or any expression (e.g. ['feature-state', 'odds'] for numbers computed in the browser).
 */
export function fillExpression(value: string | unknown[], cls: Classes, colors: string[]): unknown {
  const v = typeof value === 'string' ? ['get', value] : value;
  const steps: (string | number)[] = [colors[0]];
  cls.breaks.forEach((b, i) => steps.push(b, colors[i + 1]));
  return cls.breaks.length
    ? ['case', ['!=', ['typeof', v], 'number'], NODATA, ['step', v, ...steps]]
    : ['case', ['!=', ['typeof', v], 'number'], NODATA, colors[0]];
}

/** Idaho's bounding box: maps open framed on the whole state, clear of the key in the corner. */
export const IDAHO_BOUNDS: [[number, number], [number, number]] = [[-117.25, 41.98], [-111.04, 49.0]];

/**
 * Moose, sheep and goat success runs 60-100%, so ranking units against each other paints a 75% unit red.
 * Judge them against fixed standards instead: under 50% orange, 60-70% yellow, 70%+ greens. No deep red.
 * Values in percent (the unit map); pass scale 0.01 for fractions (Find Hunts).
 */
export const MSG_SUCCESS_BREAKS = [50, 60, 70, 80, 90];
const MSG_SUCCESS_IDX = [1, 2, 3, 4, 5, 6];
export const isMsgSuccess = (field: string) => /^ctlSuccess(Moose|Bighorn|Goat)$/.test(field);
export const msgSuccessClasses = (values: number[], scale = 1) =>
  benchmarkClasses(values, MSG_SUCCESS_BREAKS.map((b) => b * scale), MSG_SUCCESS_IDX);
/** The classes a unit-map field shades by. */
export const classesFor = (field: string, values: number[]): Classes =>
  isMsgSuccess(field) ? msgSuccessClasses(values) : divergingClasses(values, fieldMode(field));
