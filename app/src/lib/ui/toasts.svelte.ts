/**
 * Transient messages.
 *
 * Successes replace each other and fade; errors stack and persist until
 * dismissed, so a run of failures on a bad afternoon is all still readable
 * (static/js/tracker.js:790-825).
 */
export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const SUCCESS_MS = 2200;

let nextId = 1;

export const toasts = $state<Toast[]>([]);

export function dismiss(id: number): void {
  const index = toasts.findIndex((toast) => toast.id === id);
  if (index !== -1) toasts.splice(index, 1);
}

export function push(message: string, kind: ToastKind = 'success'): number {
  const id = nextId++;

  if (kind === 'success') {
    // Only one success at a time; a new one supersedes the last.
    for (let i = toasts.length - 1; i >= 0; i--) {
      if (toasts[i].kind === 'success') toasts.splice(i, 1);
    }
  }

  toasts.push({ id, kind, message });
  if (kind === 'success') setTimeout(() => dismiss(id), SUCCESS_MS);
  return id;
}

export const clear = (): void => void toasts.splice(0, toasts.length);
