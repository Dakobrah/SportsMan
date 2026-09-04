/**
 * Loading state for a screen.
 *
 * Every list and detail screen needs the same three things — the data, a
 * loading flag and a readable error — plus a way to reload after a write.
 * This is that, once.
 */
import { isCodedError } from './errors';

export function describeError(error: unknown): string {
  if (isCodedError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface Resource<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: string;
  reload(): Promise<void>;
}

/** Runs `fetcher` immediately, and again on `reload()`. */
export function resource<T>(fetcher: () => Promise<T>): Resource<T> {
  const state = $state({
    data: undefined as T | undefined,
    loading: true,
    error: '',
  });

  async function reload(): Promise<void> {
    state.loading = true;
    state.error = '';
    try {
      state.data = await fetcher();
    } catch (error) {
      state.error = describeError(error);
    } finally {
      state.loading = false;
    }
  }

  void reload();

  return {
    get data() {
      return state.data;
    },
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
    reload,
  };
}
