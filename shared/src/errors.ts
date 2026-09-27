export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_TYPE",
  "RATE_LIMITED",
  "PRECONDITION_FAILED",
  "UPSTREAM_ERROR",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  RATE_LIMITED: 429,
  PRECONDITION_FAILED: 412,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  correlationId: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  toBody(correlationId: string): ApiErrorBody {
    return {
      error: { code: this.code, message: this.message, details: this.details },
      correlationId,
    };
  }
}

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
