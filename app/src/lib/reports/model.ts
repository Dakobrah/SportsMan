/**
 * What a report IS.
 *
 * Every template produces this same shape, which is what lets one renderer,
 * one exporter and one set of chart components serve all of them. Adding a
 * template adds a file, not a branch in the renderer.
 */
import type { Conversion } from './metrics';
import type { Drive } from './drives';
import type { QuarterPoints } from './scoring';
import type { YardageBucketRow, ZoneRow } from '../db/reports/team';


/** One game's points on a season trend. */
export interface TrendPoint {
  label: string;
  us: number;
  them: number;
}

export type TemplateId = 'post-game' | 'post-season' | 'opponent' | 'player';

/** What a report is about. Round-trips through the query string. */
export type Scope =
  | { kind: 'game'; gameId: number }
  | { kind: 'season'; seasonId: number }
  | { kind: 'opponent'; opponent: string; seasonId?: number }
  | { kind: 'player'; playerId: number; seasonId?: number };

export interface Stat {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad';
}

export interface TableBody {
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number>[];
}

export type ChartSpec =
  | { chart: 'scoringByQuarter'; data: QuarterPoints[]; us: string; them: string }
  | { chart: 'driveChart'; drives: Drive[]; us: string; them: string }
  | { chart: 'pointsTrend'; data: TrendPoint[]; us: string; them: string }
  | { chart: 'downEfficiency'; data: Conversion[]; comparison?: Conversion[]; comparisonLabel?: string }
  | { chart: 'yardageDistribution'; data: YardageBucketRow[] }
  | { chart: 'fieldZones'; data: ZoneRow[] };

export type Block =
  | { type: 'stats'; title?: string; stats: Stat[] }
  | { type: 'bluf'; title: string; lines: string[] }
  | { type: 'table'; title: string; body: TableBody }
  | { type: 'text'; title?: string; body: string }
  | {
      type: 'chart';
      title: string;
      chart: ChartSpec;
      caption?: string;
      /**
       * REQUIRED, and that is the point.
       *
       * Making the table mandatory in the TYPE is what guarantees every
       * chart has an accessible twin, that a tooltip is never the only way
       * to read a value, and that the Markdown export cannot lose a number.
       * There is no code path that produces a chart without its data.
       */
      body: TableBody;
    };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export interface ReportModel {
  templateId: TemplateId;
  title: string;
  subtitle: string;
  generatedAt: string;
  /** The single number the report is about, shown large. */
  headline?: Stat;
  sections: Section[];
}

// --- Small builders, so a template reads as content rather than punctuation ---

export const stat = (label: string, value: string | number, extra: Partial<Stat> = {}): Stat => ({
  label,
  value: String(value),
  ...extra,
});

export const table = (
  columns: TableBody['columns'],
  rows: TableBody['rows'],
): TableBody => ({ columns, rows });

export const section = (id: string, title: string, blocks: (Block | null)[]): Section => ({
  id,
  title,
  // A template can hand back null for a section that has nothing to show --
  // an empty special-teams block is worse than no block.
  blocks: blocks.filter((b): b is Block => b !== null),
});

/** One decimal, and never "-0.0". */
export const fixed = (value: number, places = 1): string => {
  const out = value.toFixed(places);
  return out === `-${(0).toFixed(places)}` ? (0).toFixed(places) : out;
};

export const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));
