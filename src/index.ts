/**
 * Cloudflare Worker： ashesborn.cloud 事务性邮件发送服务
 *
 * 路由：
 *   GET  /health  健康检查（不鉴权）
 *   POST /send    发送邮件（Bearer SEND_API_KEY）
 *
 * 发送策略（自动降级）：
 *   1) 有 send_email binding（env.EMAIL）→ 直接用 Workers binding
 *   2) 否则有 CF_ACCOUNT_ID + CF_API_TOKEN → 调 Email Sending REST API
 *   3) 都没有 → 503，说明需要开通 Email Sending 或配置 REST 兜底
 */
import type { AddressLike, Env, SendRequest } from './types';
import { estimateSize, MAX_MESSAGE_BYTES, validateSendRequest } from './lib/validate';
import { mapBindingError, mapRestError, type MappedError } from './lib/errors';

const REST_ENDPOINT = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function fail(e: MappedError, extra: Record<string, string> = {}): Response {
  return json({ success: false, error: { code: e.code, message: e.message, hint: e.hint } }, e.status, extra);
}

/** 按 ALLOWED_ORIGINS 计算 CORS 头；未命中的来源不加头 */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin) && !allowed.includes('*')) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/** 常量时间比较，避免密钥被计时侧信道猜测 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request, env: Env): 'ok' | 'missing_config' | 'unauthorized' {
  if (!env.SEND_API_KEY) return 'missing_config';
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return safeEqual(token, env.SEND_API_KEY) ? 'ok' : 'unauthorized';
}

/** 结构化发送日志：不打印密钥与正文 */
function logSend(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: 'email-send', ts: new Date().toISOString(), ...entry }));
}

/** binding 对 EmailAddress 的 name 字段类型敏感，无显示名时统一降级成纯字符串地址 */
function normalizeAddress(a: AddressLike): string {
  if (typeof a === 'string') return a;
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

function normalizeAddressList(v: AddressLike | AddressLike[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(normalizeAddress);
}

/** 把请求体整理成 binding 能吃的最简形态 */
function toBindingMessage(msg: SendRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    to: normalizeAddressList(msg.to),
    from: normalizeAddress(msg.from ?? ''),
    subject: msg.subject,
  };
  if (msg.html) out.html = msg.html;
  if (msg.text) out.text = msg.text;
  const cc = normalizeAddressList(msg.cc);
  if (cc) out.cc = cc;
  const bcc = normalizeAddressList(msg.bcc);
  if (bcc) out.bcc = bcc;
  if (msg.replyTo) out.replyTo = normalizeAddress(msg.replyTo);
  if (msg.headers) out.headers = msg.headers;
  if (msg.attachments) out.attachments = msg.attachments;
  return out;
}

interface SendOutcome {
  via: 'binding' | 'rest';
  messageId?: string;
  delivery?: unknown;
}

/** 走 Workers binding 发送 */
async function sendViaBinding(env: Env, msg: SendRequest): Promise<SendOutcome> {
  if (!env.EMAIL) throw new Error('binding missing');
  const payload = toBindingMessage(msg) as unknown as Parameters<NonNullable<Env['EMAIL']>['send']>[0];
  const res = await env.EMAIL.send(payload);
  return { via: 'binding', messageId: res.messageId };
}

/** 走 REST API 发送（账号未开通 binding 或本地在 Node 里跑时的兜底） */
async function sendViaRest(env: Env, msg: SendRequest): Promise<SendOutcome> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) throw new Error('rest credentials missing');
  const res = await fetch(REST_ENDPOINT(env.CF_ACCOUNT_ID), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(msg),
  });
  const payload = (await res.json()) as { success?: boolean; result?: unknown; errors?: unknown };
  if (!res.ok || !payload.success) {
    const mapped = mapRestError(payload.errors);
    throw Object.assign(new Error(mapped.message), { code: mapped.code, mapped });
  }
  return { via: 'rest', delivery: payload.result };
}

async function handleSend(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const auth = authorized(request, env);
  if (auth === 'missing_config') {
    return fail(
      { status: 500, code: 'server_misconfigured', message: 'SEND_API_KEY is not configured', hint: 'wrangler secret put SEND_API_KEY' },
      cors,
    );
  }
  if (auth === 'unauthorized') {
    return fail({ status: 401, code: 'unauthorized', message: 'missing or invalid bearer token' }, cors);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ status: 400, code: 'invalid_json', message: 'request body must be valid JSON' }, cors);
  }

  const validated = validateSendRequest(body, env.DEFAULT_FROM);
  if (!validated.ok) {
    return fail({ status: 400, code: 'validation_error', message: validated.error }, cors);
  }
  const msg = validated.value;

  if (estimateSize(msg) > MAX_MESSAGE_BYTES) {
    return fail(
      { status: 413, code: 'E_CONTENT_TOO_LARGE', message: 'message exceeds the 5 MiB limit' },
      cors,
    );
  }

  const started = Date.now();
  const recipients = (Array.isArray(msg.to) ? msg.to.length : 1) +
    (msg.cc ? (Array.isArray(msg.cc) ? msg.cc.length : 1) : 0) +
    (msg.bcc ? (Array.isArray(msg.bcc) ? msg.bcc.length : 1) : 0);

  const hasBinding = Boolean(env.EMAIL);
  const hasRest = Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN);
  if (!hasBinding && !hasRest) {
    logSend({ level: 'error', reason: 'no_transport', elapsed_ms: Date.now() - started });
    return fail(
      {
        status: 503,
        code: 'no_transport',
        message: 'no email transport configured',
        hint: 'onboard ashesborn.cloud for Email Sending (Workers Paid) to get the EMAIL binding, or set CF_ACCOUNT_ID + CF_API_TOKEN',
      },
      cors,
    );
  }

  try {
    const outcome = hasBinding ? await sendViaBinding(env, msg) : await sendViaRest(env, msg);
    logSend({
      level: 'info',
      via: outcome.via,
      recipients,
      subject: msg.subject.slice(0, 60),
      elapsed_ms: Date.now() - started,
      message_id: outcome.messageId ?? null,
    });
    return json(
      { success: true, via: outcome.via, messageId: outcome.messageId, delivery: outcome.delivery },
      200,
      cors,
    );
  } catch (err) {
    const mapped =
      (err as { mapped?: MappedError }).mapped ?? mapBindingError(err);
    logSend({
      level: 'error',
      via: hasBinding ? 'binding' : 'rest',
      recipients,
      subject: msg.subject.slice(0, 60),
      elapsed_ms: Date.now() - started,
      code: mapped.code,
      message: mapped.message,
    });
    return fail(mapped, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(
        {
          ok: true,
          binding: env.EMAIL ? 'available' : 'missing',
          rest_fallback: Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
          from: env.DEFAULT_FROM ?? null,
        },
        200,
        cors,
      );
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      return handleSend(request, env);
    }

    return json({ success: false, error: { code: 'not_found', message: `no route for ${request.method} ${url.pathname}` } }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
