import { describe, expect, it } from 'vitest';
import {
  compilePattern,
  href,
  matchRoute,
  numericParam,
  parseHash,
  type RouteDef,
} from '../../src/lib/router';

// Route components are irrelevant to matching; a stub keeps these pure.
const stub = (() => null) as unknown as RouteDef['component'];
const route = (pattern: string, chrome?: boolean): RouteDef => ({ pattern, component: stub, chrome });

const routes: RouteDef[] = [
  route('/'),
  route('/games'),
  route('/games/new'),
  route('/games/:id'),
  route('/games/:id/plays'),
  route('/games/:id/tracker', false),
  route('/teams/:teamId/players/new'),
  route('*'),
];

describe('pattern compilation', () => {
  it('captures named segments', () => {
    const { regexp, names } = compilePattern('/games/:id/plays');
    expect(names).toEqual(['id']);
    expect(regexp.test('/games/12/plays')).toBe(true);
    expect(regexp.test('/games/12/tracker')).toBe(false);
  });

  it('does not let a parameter swallow a slash', () => {
    expect(compilePattern('/games/:id').regexp.test('/games/12/plays')).toBe(false);
  });

  it('tolerates a trailing slash', () => {
    expect(compilePattern('/games').regexp.test('/games/')).toBe(true);
  });
});

describe('matchRoute', () => {
  it('prefers a literal over a parameter declared later', () => {
    expect(matchRoute(routes, '/games/new')?.route.pattern).toBe('/games/new');
    expect(matchRoute(routes, '/games/12')?.route.pattern).toBe('/games/:id');
  });

  it('extracts params, decoded', () => {
    expect(matchRoute(routes, '/games/12/plays')?.params).toEqual({ id: '12' });
    expect(matchRoute(routes, '/teams/3/players/new')?.params).toEqual({ teamId: '3' });
  });

  it('carries route metadata through', () => {
    expect(matchRoute(routes, '/games/12/tracker')?.route.chrome).toBe(false);
    expect(matchRoute(routes, '/games/12')?.route.chrome).toBeUndefined();
  });

  it('falls through to the catch-all', () => {
    expect(matchRoute(routes, '/nowhere')?.route.pattern).toBe('*');
  });

  it('returns null when nothing matches and there is no catch-all', () => {
    expect(matchRoute([route('/games')], '/teams')).toBeNull();
  });
});

describe('parseHash', () => {
  it('treats an empty hash as the root', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
  });

  it('strips the hash and splits the query', () => {
    const parsed = parseHash('#/games?season=2&result=W');
    expect(parsed.path).toBe('/games');
    expect(parsed.query.get('season')).toBe('2');
    expect(parsed.query.get('result')).toBe('W');
  });

  it('leaves a path without a query alone', () => {
    const parsed = parseHash('#/games/12/tracker');
    expect(parsed.path).toBe('/games/12/tracker');
    expect([...parsed.query.keys()]).toEqual([]);
  });

  it('always produces a leading slash', () => {
    expect(parseHash('#games').path).toBe('/games');
  });
});

describe('helpers', () => {
  it('builds an href', () => {
    expect(href('/games/12')).toBe('#/games/12');
  });

  it('accepts only positive integer ids', () => {
    expect(numericParam({ id: '12' }, 'id')).toBe(12);
    expect(numericParam({ id: '0' }, 'id')).toBeNull();
    expect(numericParam({ id: '-3' }, 'id')).toBeNull();
    expect(numericParam({ id: '1.5' }, 'id')).toBeNull();
    expect(numericParam({ id: 'abc' }, 'id')).toBeNull();
    expect(numericParam({}, 'id')).toBeNull();
  });
});
