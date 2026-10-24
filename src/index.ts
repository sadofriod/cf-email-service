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
import { countOutbox, getOutbox, listOutbox, OUTBOX_KEY_PREFIX_LEN, recordOutbox, type OutboxEntry } from './lib/outbox';
import { getTemplate, listTemplates } from './templates';
import { DEFAULT_DOMAIN, getDomain, listDomains } from './templates/domains';
import type { TemplateDefinition } from './templates/types';

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

function outboxAuthorized(request: Request, env: Env): boolean {
  if (!env.SEND_API_KEY) return false;
  const url = new URL(request.url);
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : url.searchParams.get('token') ?? '';
  return safeEqual(token, env.SEND_API_KEY);
}

/** 模板接口与发送接口共用的 Bearer 鉴权响应。 */
function requireAuthorization(request: Request, env: Env, cors: Record<string, string>): Response | null {
  const auth = authorized(request, env);
  if (auth === 'missing_config') {
    return fail({ status: 500, code: 'server_misconfigured', message: 'SEND_API_KEY is not configured', hint: 'wrangler secret put SEND_API_KEY' }, cors);
  }
  return auth === 'unauthorized'
    ? fail({ status: 401, code: 'unauthorized', message: 'missing or invalid bearer token' }, cors)
    : null;
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

function addressesFromUnknown(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.filter((item): item is AddressLike => typeof item === 'string' || Boolean(item && typeof item === 'object' && 'email' in item))
    .map(normalizeAddress);
}

function outboxEntry(body: unknown, msg: SendRequest | undefined, via: 'binding' | 'rest', status: 'sent' | 'failed', error?: { code: string; message: string }, messageId?: string): OutboxEntry {
  const request = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const source = msg ?? request as unknown as SendRequest;
  const html = typeof source.html === 'string' ? source.html : undefined;
  const text = typeof source.text === 'string' ? source.text : undefined;
  return {
    to: addressesFromUnknown(source.to),
    cc: addressesFromUnknown(source.cc),
    bcc: addressesFromUnknown(source.bcc),
    from: typeof source.from === 'string' ? source.from : envAddress(source.from),
    subject: typeof source.subject === 'string' ? source.subject : '',
    ...(typeof request.template === 'string' ? { template: request.template } : {}),
    ...(typeof request.domain === 'string' ? { domain: request.domain } : {}),
    ...(typeof request.locale === 'string' ? { locale: request.locale } : {}),
    via,
    status,
    ...(messageId ? { messageId } : {}),
    ...(error ? { error } : {}),
    bytes: msg ? estimateSize(msg) : new TextEncoder().encode(JSON.stringify(body)).byteLength,
    ...(html !== undefined ? { html } : {}),
    ...(text !== undefined ? { text } : {}),
  };
}

function envAddress(value: unknown): string {
  return value && typeof value === 'object' && 'email' in value && typeof value.email === 'string' ? normalizeAddress(value as AddressLike) : '';
}

async function recordOutboxSafely(env: Env, entry: OutboxEntry): Promise<void> {
  try {
    await recordOutbox(env, entry);
  } catch (err) {
    logSend({ level: 'error', reason: 'outbox_write_failed', message: err instanceof Error ? err.message : String(err) });
  }
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
  const authFailure = requireAuthorization(request, env, cors);
  if (authFailure) return authFailure;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ status: 400, code: 'invalid_json', message: 'request body must be valid JSON' }, cors);
  }

  const selectedVia: 'binding' | 'rest' = env.EMAIL ? 'binding' : 'rest';
  const recordFailure = async (code: string, message: string, msg?: SendRequest): Promise<void> => {
    await recordOutboxSafely(env, outboxEntry(body, msg, selectedVia, 'failed', { code, message }));
  };

  const templateResult = renderTemplateRequest(body);
  if (!templateResult.ok) {
    await recordFailure(templateResult.error.code, templateResult.error.field ?? String(templateResult.error.domain ?? templateResult.error.code));
    return json(templateResult.error, templateResult.status, cors);
  }

  const validated = validateSendRequest(templateResult.value, env.DEFAULT_FROM);
  if (!validated.ok) {
    await recordFailure('validation_error', validated.error);
    return fail({ status: 400, code: 'validation_error', message: validated.error }, cors);
  }
  const msg = validated.value;

  if (estimateSize(msg) > MAX_MESSAGE_BYTES) {
    await recordFailure('E_CONTENT_TOO_LARGE', 'message exceeds the 5 MiB limit', msg);
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
    await recordFailure('no_transport', 'no email transport configured', msg);
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
    await recordOutboxSafely(env, outboxEntry(body, msg, outcome.via, 'sent', undefined, outcome.messageId));
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
    await recordOutboxSafely(env, outboxEntry(body, msg, hasBinding ? 'binding' : 'rest', 'failed', { code: mapped.code, message: mapped.message }));
    return fail(mapped, cors);
  }
}

type TemplateRequestResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: { code: string; field?: string; domain?: unknown } };

function isMissingField(data: Record<string, unknown>, field: string): boolean {
  const value = data[field];
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/** 在标准发送校验前，把模板与原请求的传输字段合并。 */
function renderTemplateRequest(body: unknown): TemplateRequestResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: true, value: body };
  const request = body as Record<string, unknown>;
  if (typeof request.template !== 'string') return { ok: true, value: body };

  const template = getTemplate(request.template);
  if (!template) return { ok: false, status: 404, error: { code: 'template_not_found' } };
  const data = request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, status: 400, error: { code: 'template_field_missing', field: 'data' } };
  }
  const fields = data as Record<string, unknown>;
  const requestedDomain = request.domain ?? fields.domain;
  if (requestedDomain !== undefined && (typeof requestedDomain !== 'string' || !getDomain(requestedDomain))) {
    return { ok: false, status: 400, error: { code: 'unknown_domain', domain: requestedDomain } };
  }
  for (const field of template.requiredFields) {
    if (isMissingField(fields, field)) return { ok: false, status: 400, error: { code: 'template_field_missing', field } };
  }
  if (template.id === 'kickoff-scope' && (!Array.isArray(fields.threeQuestions) || fields.threeQuestions.length !== 3)) {
    return { ok: false, status: 400, error: { code: 'template_field_missing', field: 'threeQuestions' } };
  }
  const rendered = template.render({ ...fields, domain: requestedDomain ?? fields.domain ?? DEFAULT_DOMAIN });
  return { ok: true, value: { ...request, to: request.to ?? fields.to, subject: rendered.subject, html: rendered.html, text: rendered.text } };
}

function templateSummary(template: TemplateDefinition): Omit<TemplateDefinition, 'render' | 'sample' | 'optionalFields'> {
  return { id: template.id, description: template.description, locales: template.locales, requiredFields: template.requiredFields, domains: template.domains };
}

async function handlePreview(request: Request, env: Env, id: string): Promise<Response> {
  const cors = corsHeaders(request, env);
  const authFailure = requireAuthorization(request, env, cors);
  if (authFailure) return authFailure;
  const template = getTemplate(id);
  if (!template) return json({ code: 'template_not_found' }, 404, cors);
  let body: unknown;
  try { body = await request.json(); } catch { return fail({ status: 400, code: 'invalid_json', message: 'request body must be valid JSON' }, cors); }
  const data = body && typeof body === 'object' && !Array.isArray(body) && 'data' in body
    ? (body as Record<string, unknown>).data : body;
  const domain = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).domain ?? (data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).domain : undefined)
    : undefined;
  const result = renderTemplateRequest({ template: id, data, domain });
  if (!result.ok) return json(result.error, result.status, cors);
  const rendered = template.render({ ...(data as Record<string, unknown>), domain: domain ?? DEFAULT_DOMAIN });
  return json(rendered, 200, cors);
}

const OUTBOX_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'no-referrer' };

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function outboxUnauthorized(): Response {
  return new Response('<!doctype html><title>Unauthorized</title><p>Unauthorized. For browser access, add <code>?token=SEND_API_KEY</code>.</p>', { status: 401, headers: OUTBOX_HEADERS });
}

function outboxPage(title: string, content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{max-width:1000px;margin:32px auto;padding:0 16px;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17212b}a{color:#0759ad}table{width:100%;border-collapse:collapse}th,td{padding:9px 7px;border-bottom:1px solid #dce3ea;text-align:left;vertical-align:top}.sent{color:#157a35;font-weight:600}.failed{color:#b42318;font-weight:600}.muted{color:#5f6b76}.wrap{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}iframe{width:100%;height:520px;border:1px solid #dce3ea}</style><body>${content}</body></html>`, { status, headers: OUTBOX_HEADERS });
}

function boundedLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '50', 10);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 50;
}

function outboxLink(path: string, url: URL, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const token = url.searchParams.get('token');
  if (token) params.set('token', token);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

async function handleOutboxList(request: Request, env: Env, url: URL, asJson: boolean): Promise<Response> {
  if (!outboxAuthorized(request, env)) return outboxUnauthorized();
  const limit = boundedLimit(url.searchParams.get('limit'));
  const result = await listOutbox(env, limit, url.searchParams.get('cursor') ?? undefined);
  if (asJson) return json({ items: result.items, cursor: result.cursor, count: result.items.length }, 200, { 'referrer-policy': 'no-referrer' });
  const total = await countOutbox(env);
  const rows = result.items.map((item) => {
    const recipients = item.to.slice(0, 2).join(', ') + (item.to.length > 2 ? ` +${item.to.length - 2}` : '');
    const detail = outboxLink(`/outbox/${encodeURIComponent(item.key.slice(OUTBOX_KEY_PREFIX_LEN))}`, url);
    const subject = item.subject || (item.status === 'failed' ? '(未发送成功)' : '(无主题)');
    return `<tr><td>${escapeHtml(new Date(item.ts).toISOString().replace('T', ' ').replace('.000Z', ' UTC'))}</td><td class="${item.status}">${escapeHtml(item.status)}</td><td class="wrap">${escapeHtml(recipients)}</td><td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px"><a href="${escapeHtml(detail)}">${escapeHtml(subject)}</a></td><td>${escapeHtml(item.template ?? item.domain ?? '')}</td><td>${escapeHtml(item.via)}</td><td>${escapeHtml(item.status === 'failed' ? item.error?.code ?? '' : '')}</td><td class="wrap">${escapeHtml(item.messageId?.slice(0, 16) ?? '')}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">暂无记录（KV 未绑定或记录已过期）。</td></tr>';
  const next = result.cursor ? ` <a href="${escapeHtml(outboxLink('/outbox', url, { limit: String(limit), cursor: result.cursor }))}">下一页</a>` : '';
  const refresh = outboxLink('/outbox', url, { limit: String(limit) });
  return outboxPage('Outbox', `<h1>已发送邮件</h1><p>总数 ${total}，本页 ${result.items.length}。元数据保留 90 天，正文保留 30 天。<a href="${escapeHtml(refresh)}">刷新</a>${next}</p><table><colgroup><col style="width:190px"><col style="width:70px"><col><col><col><col style="width:70px"><col><col></colgroup><thead><tr><th>时间（UTC）</th><th>状态</th><th>收件人</th><th>主题</th><th>模板/领域</th><th>via</th><th>错误</th><th>messageId</th></tr></thead><tbody>${rows}</tbody></table>`);
}

async function handleOutboxDetail(request: Request, env: Env, url: URL, key: string): Promise<Response> {
  if (!outboxAuthorized(request, env)) return outboxUnauthorized();
  const item = await getOutbox(env, key);
  if (!item) return outboxPage('Not found', '<h1>404</h1><p>邮件记录不存在或已过期。</p>', 404);
  const format = url.searchParams.get('format');
  if (format === 'text') return new Response(item.body?.text ?? '', { headers: { 'content-type': 'text/plain; charset=utf-8', 'referrer-policy': 'no-referrer' } });
  if (format === 'raw') return new Response(item.body?.html ?? '', { headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
  const rows = [
    ['时间（UTC）', new Date(item.ts).toISOString()], ['From', item.from], ['To', item.to.join(', ')], ['Cc', item.cc?.join(', ') ?? ''], ['Bcc', item.bcc?.join(', ') ?? ''], ['主题', item.subject], ['模板', item.template ?? ''], ['领域', item.domain ?? ''], ['Locale', item.locale ?? ''], ['Via', item.via], ['状态', item.status], ['Message ID', item.messageId ?? ''], ['错误', item.error ? `${item.error.code}: ${item.error.message}` : ''], ['字节数', item.bytes],
  ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td class="wrap">${escapeHtml(value)}</td></tr>`).join('');
  const textLink = outboxLink(`/outbox/${encodeURIComponent(key)}`, url, { format: 'text' });
  const rawLink = outboxLink(`/outbox/${encodeURIComponent(key)}`, url, { format: 'raw' });
  const body = item.body?.html
    // Email HTML is untrusted content, so render it in an opaque-origin sandbox without scripts.
    ? `<iframe sandbox srcdoc="${escapeHtml(item.body.html)}" title="邮件正文" style="width:100%;height:420px;border:1px solid #e5e5e5;border-radius:4px;background:#fff"></iframe>`
    : `<p class="muted">${item.bodyExpired ? '正文已过期或未保存。' : '此记录没有 HTML 正文。'}</p>`;
  return outboxPage('Outbox detail', `<p><a href="${escapeHtml(outboxLink('/outbox', url))}">返回列表</a></p><h1>邮件详情</h1><table>${rows}</table><h2>正文</h2>${body}<p><a href="${escapeHtml(textLink)}">纯文本版</a> · <a href="${escapeHtml(rawLink)}">原始 HTML</a></p>`);
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

    if (request.method === 'GET' && url.pathname === '/outbox') {
      return handleOutboxList(request, env, url, false);
    }

    if (request.method === 'GET' && url.pathname === '/outbox.json') {
      return handleOutboxList(request, env, url, true);
    }

    const outboxMatch = url.pathname.match(/^\/outbox\/([^/]+)$/);
    if (request.method === 'GET' && outboxMatch) {
      return handleOutboxDetail(request, env, url, decodeURIComponent(outboxMatch[1] ?? ''));
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      return handleSend(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/templates') {
      const authFailure = requireAuthorization(request, env, cors);
      if (authFailure) return authFailure;
      return json({ templates: listTemplates().map(templateSummary) }, 200, cors);
    }

    if (request.method === 'GET' && url.pathname === '/templates/domains') {
      const authFailure = requireAuthorization(request, env, cors);
      if (authFailure) return authFailure;
      return json({ domains: listDomains().map(({ id, label, buyerPersona, evidenceTypes, triggerTypes, sampleFindings }) => ({ id, label, buyerPersona, evidenceTypes, triggerTypes, sampleFindings })) }, 200, cors);
    }

    const previewMatch = url.pathname.match(/^\/templates\/([^/]+)\/preview$/);
    if (request.method === 'POST' && previewMatch) {
      return handlePreview(request, env, decodeURIComponent(previewMatch[1] ?? ''));
    }

    return json({ success: false, error: { code: 'not_found', message: `no route for ${request.method} ${url.pathname}` } }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
