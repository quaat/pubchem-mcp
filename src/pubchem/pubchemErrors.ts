/**
 * Typed error hierarchy for PubChem access.
 *
 * The MCP layer maps these to user-facing error responses. Messages here
 * must be safe to surface to LLM clients: no full stack traces, no raw
 * internal URLs, no secrets.
 */

export type PubChemErrorCategory =
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'transient'
  | 'unsupported'
  | 'response';

export abstract class PubChemError extends Error {
  abstract readonly category: PubChemErrorCategory;
  /** Whether retrying the same request may succeed. */
  abstract readonly retryable: boolean;
  /** Sanitized endpoint label, e.g. "compound/name" — never the full URL. */
  readonly endpoint?: string;
  readonly status?: number;

  constructor(message: string, opts?: { endpoint?: string; status?: number; cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.endpoint = opts?.endpoint;
    this.status = opts?.status;
    if (opts?.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export class PubChemValidationError extends PubChemError {
  readonly category = 'validation' as const;
  readonly retryable = false;
}

export class PubChemNotFoundError extends PubChemError {
  readonly category = 'not_found' as const;
  readonly retryable = false;
}

export class PubChemRateLimitError extends PubChemError {
  readonly category = 'rate_limit' as const;
  readonly retryable = true;
}

export class PubChemTransientError extends PubChemError {
  readonly category = 'transient' as const;
  readonly retryable = true;
}

export class PubChemUnsupportedOperationError extends PubChemError {
  readonly category = 'unsupported' as const;
  readonly retryable = false;
}

export class PubChemResponseError extends PubChemError {
  readonly category = 'response' as const;
  readonly retryable = false;
}

/**
 * Map an HTTP status code to a PubChemError class. Returns undefined for
 * success status codes (2xx).
 */
export function classifyHttpStatus(
  status: number,
): typeof PubChemError | undefined {
  if (status >= 200 && status < 300) return undefined;
  if (status === 400) return PubChemValidationError;
  if (status === 404) return PubChemNotFoundError;
  if (status === 405 || status === 501) return PubChemUnsupportedOperationError;
  if (status === 429) return PubChemRateLimitError;
  if (status >= 500 && status < 600) return PubChemTransientError;
  // 4xx not otherwise mapped → treat as validation/non-retryable.
  if (status >= 400 && status < 500) return PubChemValidationError;
  return PubChemResponseError;
}
