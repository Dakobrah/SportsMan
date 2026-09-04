/**
 * The reactive half of the router: current location as `$state`, and the
 * hashchange subscription. Split from router.ts so the matching logic can be
 * tested without a DOM.
 */
import { matchRoute, parseHash, type RouteDef, type RouteMatch } from './router';

export const router = $state({
  path: '/',
  params: {} as Record<string, string>,
  query: new URLSearchParams(),
  match: null as RouteMatch | null,
});

function apply(routes: RouteDef[]): void {
  const { path, query } = parseHash(window.location.hash);
  const found = matchRoute(routes, path);

  router.path = path;
  router.query = query;
  router.match = found;
  router.params = found?.params ?? {};
}

/** Begin routing. Returns an unsubscribe for teardown. */
export function start(routes: RouteDef[]): () => void {
  const handler = () => apply(routes);

  // An empty hash means the app was opened cold; normalise it so there is
  // always a route in the address bar.
  if (!window.location.hash) window.location.replace('#/');
  handler();

  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  if (options.replace) {
    window.location.replace(target);
  } else {
    window.location.hash = path;
  }
}

/** Back, falling back to a path when there is no history to go back to. */
export function back(fallback = '/'): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
