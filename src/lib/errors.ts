/**
 * 错误映射：把 Workers binding 的字符串错误码、REST API 的数字错误码
 * 统一映射成稳定的 HTTP status + 机器可读的 code。
 */

export interface MappedError {
  status: number;
  code: string;
  message: string;
  hint?: string;
}

/** binding 抛出的错误 → 对外错误 */
const BINDING_MAP: Record<string, MappedError> = {
  E_VALIDATION_ERROR: { status: 400, code: 'E_VALIDATION_ERROR', message: 'payload validation failed' },
  E_FIELD_MISSING: { status: 400, code: 'E_FIELD_MISSING', message: 'required field missing (to / from / subject)' },
  E_TOO_MANY_RECIPIENTS: { status: 400, code: 'E_TOO_MANY_RECIPIENTS', message: 'too many recipients (max 50 combined)' },
  E_TOO_MANY_ATTACHMENTS: { status: 400, code: 'E_TOO_MANY_ATTACHMENTS', message: 'too many attachments (max 32)' },
  E_SENDER_NOT_VERIFIED: {
    status: 403,
    code: 'E_SENDER_NOT_VERIFIED',
    message: 'sender domain is not verified for Email Sending',
    hint: 'onboard the domain at Compute > Email Service > Email Sending, then wait for DNS propagation',
  },
  E_SENDER_DOMAIN_NOT_AVAILABLE: {
    status: 403,
    code: 'E_SENDER_DOMAIN_NOT_AVAILABLE',
    message: 'sender domain is not onboarded to Email Service',
    hint: 'Email Sending requires the Workers Paid plan; onboard ashesborn.cloud first',
  },
  E_RECIPIENT_NOT_ALLOWED: {
    status: 403,
    code: 'E_RECIPIENT_NOT_ALLOWED',
    message: 'recipient is not in the allowed destination list',
    hint: 'Free plan can only send to verified destination addresses; arbitrary recipients need Workers Paid',
  },
  E_RECIPIENT_SUPPRESSED: { status: 403, code: 'E_RECIPIENT_SUPPRESSED', message: 'recipient is on the suppression list' },
  E_CONTENT_TOO_LARGE: { status: 413, code: 'E_CONTENT_TOO_LARGE', message: 'message exceeds the 5 MiB limit' },
  E_RATE_LIMIT_EXCEEDED: { status: 429, code: 'E_RATE_LIMIT_EXCEEDED', message: 'rate limit exceeded, retry later' },
  E_DAILY_LIMIT_EXCEEDED: { status: 429, code: 'E_DAILY_LIMIT_EXCEEDED', message: 'daily sending quota reached' },
  E_DELIVERY_FAILED: { status: 502, code: 'E_DELIVERY_FAILED', message: 'upstream delivery failed' },
  E_HEADER_NOT_ALLOWED: { status: 400, code: 'E_HEADER_NOT_ALLOWED', message: 'header not in allowlist' },
  E_HEADER_USE_API_FIELD: { status: 400, code: 'E_HEADER_USE_API_FIELD', message: 'use the dedicated API field instead of the raw header' },
  E_HEADER_VALUE_INVALID: { status: 400, code: 'E_HEADER_VALUE_INVALID', message: 'header value invalid' },
  E_HEADER_VALUE_TOO_LONG: { status: 400, code: 'E_HEADER_VALUE_TOO_LONG', message: 'header value exceeds 2048 bytes' },
  E_HEADER_NAME_INVALID: { status: 400, code: 'E_HEADER_NAME_INVALID', message: 'header name invalid' },
  E_HEADERS_TOO_LARGE: { status: 400, code: 'E_HEADERS_TOO_LARGE', message: 'headers exceed 16 KiB' },
  E_HEADERS_TOO_MANY: { status: 400, code: 'E_HEADERS_TOO_MANY', message: 'too many custom headers (max 20)' },
  E_INTERNAL_SERVER_ERROR: { status: 500, code: 'E_INTERNAL_SERVER_ERROR', message: 'email service internal error' },
};

/** REST API 数字错误码 → 对外错误 */
const REST_MAP: Record<number, MappedError> = {
  10001: { status: 400, code: 'invalid_request_schema', message: 'invalid request schema' },
  10200: { status: 413, code: 'email_too_big', message: 'email exceeds the 5 MiB limit' },
  10201: { status: 400, code: 'no_content_length', message: 'missing content length' },
  10202: { status: 400, code: 'email_invalid', message: 'invalid email content' },
  10203: {
    status: 403,
    code: 'email_sending_disabled',
    message: 'Email Sending is disabled for this zone/account',
    hint: 'onboard the domain at Compute > Email Service > Email Sending (requires Workers Paid)',
  },
  10101: { status: 401, code: 'unauthorized', message: 'missing or invalid API token' },
  10103: { status: 401, code: 'bad_token_type', message: 'wrong token type for this endpoint' },
  10102: { status: 403, code: 'forbidden', message: 'token lacks permission to send email' },
  10105: {
    status: 403,
    code: 'not_entitled',
    message: 'account is not entitled to Email Sending',
    hint: 'Email Sending requires the Workers Paid plan ($5/month)',
  },
  10004: { status: 429, code: 'throttled', message: 'rate limit exceeded' },
  10000: { status: 404, code: 'not_found', message: 'resource not found' },
  10002: { status: 500, code: 'internal_server', message: 'email service internal error' },
  10003: { status: 500, code: 'not_implemented', message: 'operation not implemented' },
  10100: { status: 503, code: 'auth_upstream', message: 'authentication service unavailable' },
};

export function mapBindingError(err: unknown): MappedError {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && BINDING_MAP[code]) return BINDING_MAP[code];
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, code: typeof code === 'string' ? code : 'E_UNKNOWN', message };
}

export function mapRestError(errors: unknown): MappedError {
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as { code?: unknown; message?: unknown };
    const num = typeof first.code === 'number' ? first.code : Number(first.code);
    if (Number.isFinite(num) && REST_MAP[num]) return REST_MAP[num];
    const message = typeof first.message === 'string' ? first.message : 'unknown REST error';
    return { status: 502, code: `rest_${String(first.code ?? 'unknown')}`, message };
  }
  return { status: 502, code: 'rest_unknown', message: 'unknown REST error' };
}
