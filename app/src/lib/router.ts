/**
 * Hash routing.
 *
 * Hash rather than history because Tauri serves the frontend through a
 * custom-protocol asset resolver: `#/games/3/tracker` is always a request for
 * index.html, whereas `/games/3/tracker` is a request for a file that does
 * not exist. A hard reload — or an Android WebView process restart under
 * memory pressure, which happens on a sideline tablet — would land on a blank
 * page. Hash routing deletes that whole class of bug.
 *
 * Hand-rolled rather than a dependency because the route table is flat, with
 * no nested layouts and no data loading. This file is the pure half: pattern
 * matching with no DOM, so it is tested in plain Node.
 */
import type { Component } from 'svelte';

export interface RouteDef {
  /** '/games/:id/tracker'. A lone '*' matches anything not matched earlier. */
  pattern: string;
  // Route components take no required props; params come from the router.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: Component<any>;
  /** False for full-screen routes that suppress the app nav. Defaults true. */
  chrome?: boolean;
}

export interface RouteMatch {
  route: RouteDef;
  params: Record<string, string>;
}

interface Compiled {
  regexp: RegExp;
  names: string[];
}

const cache = new Map<string, Compiled>();

/** '/games/:id/plays' -> /^\/games\/([^/]+)\/plays$/ plus the names. */
export function compilePattern(pattern: string): Compiled {
  const hit = cache.get(pattern);
  if (hit) return hit;

  const names: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  const compiled = { regexp: new RegExp(`^${source}/?$`), names };
  cache.set(pattern, compiled);
  return compiled;
}

/** The first route whose pattern matches, in declaration order. */
export function matchRoute(routes: RouteDef[], path: string): RouteMatch | null {
  for (const route of routes) {
    if (route.pattern === '*') return { route, params: {} };

    const { regexp, names } = compilePattern(route.pattern);
    const found = regexp.exec(path);
    if (!found) continue;

    const params: Record<string, string> = {};
    names.forEach((name, index) => {
      params[name] = decodeURIComponent(found[index + 1]);
    });
    return { route, params };
  }
  return null;
}

export interface ParsedHash {
  path: string;
  query: URLSearchParams;
}

/** '#/games?season=2' -> { path: '/games', query }. Missing hash is '/'. */
export function parseHash(hash: string): ParsedHash {
  const raw = hash.replace(/^#/, '') || '/';
  const split = raw.indexOf('?');
  const path = split === -1 ? raw : raw.slice(0, split);
  const query = new URLSearchParams(split === -1 ? '' : raw.slice(split + 1));
  return { path: path.startsWith('/') ? path : `/${path}`, query };
}

/** For an <a href>. Keeps the '#' in one place. */
export const href = (path: string): string => `#${path}`;

/**
 * Route params arrive as strings. Every id in this app is an integer primary
 * key, so a non-integer means a hand-edited URL rather than a real record.
 */
export function numericParam(params: Record<string, string>, name: string): number | null {
  const value = Number(params[name]);
  return Number.isInteger(value) && value > 0 ? value : null;
}
