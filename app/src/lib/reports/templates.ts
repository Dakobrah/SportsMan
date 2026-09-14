/**
 * The template registry.
 *
 * A template is a name and a function from a scope to a ReportModel. Adding
 * one is a file and a line here -- the renderer, the routes and the exporter
 * all work off the model and never learn what templates exist.
 */
import type { Database } from '../db/driver';
import type { ReportModel, Scope, TemplateId } from './model';
import { buildPostGame } from './templates/postGame';

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  /** Which kind of scope it needs, so the picker can offer the right thing. */
  scopeKind: Scope['kind'];
  build(db: Database, scope: Scope): Promise<ReportModel>;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'post-game',
    name: 'Post-game report',
    description:
      'One game in full: scoring by quarter, offense and defense, drives, '
      + 'situational splits, leaders and key plays.',
    scopeKind: 'game',
    build: buildPostGame,
  },
];

export const templateById = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);
