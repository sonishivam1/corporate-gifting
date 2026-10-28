/**
 * An expected failure with a stable code. Every error leaves the API as
 * `{ error: { code, message } }` (ADR 0010). Outside the caller's scope is a
 * 404, never a 403, so existence doesn't leak.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ErrorBody = { error: { code: string; message: string } };

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}
