/**
 * Errors the UI knows how to present.
 *
 * Django wrapped every failure in an envelope with a six-hex `reference` that
 * was also written to a JSONL log (apps/core/exceptions.py,
 * apps/core/logging.py). None of that survives here: there is no server to
 * correlate a reference against, and the log was telemetry, which a
 * local-only app must not write. What remains is the part the coach actually
 * needed — a message, and which field to highlight.
 */
export class AppError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(message: string, code: string, field?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = field;
  }
}

/** Both AppError and ValidationError carry these. */
export interface CodedError {
  message: string;
  code: string;
  field?: string;
}

export const isCodedError = (error: unknown): error is CodedError =>
  error instanceof Error && typeof (error as { code?: unknown }).code === 'string';
