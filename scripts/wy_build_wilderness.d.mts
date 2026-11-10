type Geometry = { type: string; coordinates: unknown };
export interface AreaResult { acres: number; wildAcres: number; pct: number | null; wilderness: { name: string; acres: number }[] }
export interface BuildResult {
  areas: Record<string, AreaResult>;
  wilderness: { name: string; state: string; publishedAcres: number; acres: number }[];
}
export const DY: number;
export const SLIVER_ACRES: number;
export function albers(lon: number, lat: number): [number, number];
export function computeWilderness(units: { name: string; geometry: Geometry | null }[], wild: { properties: { NAME: string; STATE: string; Acreage: number }; geometry: Geometry }[]): BuildResult;
export function check(result: BuildResult, storedAcres: Record<string, number>): string[];
export function toOutput(res: BuildResult, retrieved: string): {
  areas: Record<string, { pct: number; wildAcres: number; acres: number; wilderness: { name: string; acres: number }[] }>;
  slivers: Record<string, { name: string; acres: number }[]>;
  [k: string]: unknown;
};
