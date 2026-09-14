/**
 * Reading and writing a report's scope in the URL.
 *
 * Scope rides the query string so a report is linkable and survives a
 * reload, which the hash router already parses for us.
 */
import type { Scope, TemplateId } from './model';

const number = (query: URLSearchParams, key: string): number | null => {
  const value = Number(query.get(key));
  return Number.isInteger(value) && value > 0 ? value : null;
};

/** Null when the scope is missing or malformed -- a hand-edited URL. */
export function scopeFromQuery(id: TemplateId, query: URLSearchParams): Scope | null {
  const seasonId = number(query, 'season');

  switch (id) {
    case 'post-game': {
      const gameId = number(query, 'game');
      return gameId === null ? null : { kind: 'game', gameId };
    }
    case 'post-season':
      return seasonId === null ? null : { kind: 'season', seasonId };
    case 'opponent': {
      const opponent = query.get('opponent')?.trim();
      return opponent ? { kind: 'opponent', opponent, ...(seasonId !== null && { seasonId }) } : null;
    }
    case 'player': {
      const playerId = number(query, 'player');
      return playerId === null
        ? null
        : { kind: 'player', playerId, ...(seasonId !== null && { seasonId }) };
    }
  }
}

export function queryForScope(scope: Scope): string {
  const query = new URLSearchParams();
  switch (scope.kind) {
    case 'game':
      query.set('game', String(scope.gameId));
      break;
    case 'season':
      query.set('season', String(scope.seasonId));
      break;
    case 'opponent':
      query.set('opponent', scope.opponent);
      if (scope.seasonId !== undefined) query.set('season', String(scope.seasonId));
      break;
    case 'player':
      query.set('player', String(scope.playerId));
      if (scope.seasonId !== undefined) query.set('season', String(scope.seasonId));
      break;
  }
  return query.toString();
}

export const pathForScope = (id: TemplateId, scope: Scope): string =>
  `/reports/${id}?${queryForScope(scope)}`;
