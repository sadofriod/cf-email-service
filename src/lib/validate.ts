/**
 * 请求体校验：纯函数，不抛异常，返回判别联合。
 */
import type { AddressLike, Attachment, SendRequest } from '../types';

/** 业务上允许发信的域名（含子域） */
export const SENDER_DOMAIN = 'ashesborn.cloud';

/** to + cc + bcc 合计上限（Cloudflare 限制 50） */
export const MAX_RECIPIENTS = 50;
export const MAX_SUBJECT_LEN = 200;
export const MAX_ATTACHMENTS = 32;

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/;

export type ValidationResult =
  | { ok: true; value: SendRequest }
  | { ok: false; error: string };

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 320 && EMAIL_RE.test(value.trim());
}

function toAddress(v: unknown): { email: string; name?: string } | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return isValidEmail(s) ? { email: s } : null;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const email = typeof o.email === 'string' ? o.email.trim() : '';
    if (!isValidEmail(email)) return null;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : undefined;
    return name ? { email, name } : { email };
  }
  return null;
}

function toAddressList(v: unknown): { email: string; name?: string }[] | null {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: { email: string; name?: string }[] = [];
  for (const item of arr) {
    const a = toAddress(item);
    if (!a) return null;
    out.push(a);
  }
  return out;
}

/** 发信地址必须落在 SENDER_DOMAIN 或其子域上 */
export function isSenderDomainAllowed(email: string, senderDomain: string = SENDER_DOMAIN): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  const base = senderDomain.toLowerCase();
  return domain === base || domain.endsWith(`.${base}`);
}

const ALLOWED_HEADER_RE = /^[A-Za-z0-9-]{1,100}$/;

function sanitizeHeaders(v: unknown): Record<string, string> | null | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!ALLOWED_HEADER_RE.test(k)) return null;
    if (typeof val !== 'string' || val.length === 0 || val.length > 2048) return null;
    out[k] = val;
    count += 1;
    if (count > 20) return null;
  }
  return out;
}

function sanitizeAttachments(v: unknown): Attachment[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  if (v.length > MAX_ATTACHMENTS) return null;
  const out: Attachment[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const filename = typeof o.filename === 'string' ? o.filename : '';
    const type = typeof o.type === 'string' ? o.type : '';
    const disposition = o.disposition === 'inline' ? 'inline' : 'attachment';
    const content = o.content;
    const contentOk =
      typeof content === 'string' || content instanceof ArrayBuffer || ArrayBuffer.isView(content);
    if (!filename || !type || !contentOk) return null;
    const item: Attachment = { content: content as Attachment['content'], filename, type, disposition };
    if (typeof o.contentId === 'string' && o.contentId) item.contentId = o.contentId;
    out.push(item);
  }
  return out;
}

export function validateSendRequest(
  body: unknown,
  defaultFrom: string | undefined,
): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  const to = toAddressList(b.to);
  if (!to || to.length === 0) return { ok: false, error: '`to` must be a valid email address or a non-empty array of them' };

  const cc = toAddressList(b.cc);
  if (!cc) return { ok: false, error: '`cc` contains an invalid email address' };
  const bcc = toAddressList(b.bcc);
  if (!bcc) return { ok: false, error: '`bcc` contains an invalid email address' };

  const total = to.length + cc.length + bcc.length;
  if (total > MAX_RECIPIENTS) {
    return { ok: false, error: `too many recipients: ${total} > ${MAX_RECIPIENTS}` };
  }

  const fromRaw = b.from === undefined ? defaultFrom : b.from;
  const from = toAddress(fromRaw);
  if (!from) return { ok: false, error: '`from` must be a valid email address (or set DEFAULT_FROM)' };
  if (!isSenderDomainAllowed(from.email)) {
    return { ok: false, error: `sender domain not allowed: ${from.email} (must be @${SENDER_DOMAIN})` };
  }

  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (!subject) return { ok: false, error: '`subject` is required' };
  if (subject.length > MAX_SUBJECT_LEN) {
    return { ok: false, error: `\`subject\` too long: ${subject.length} > ${MAX_SUBJECT_LEN}` };
  }

  const html = typeof b.html === 'string' && b.html.trim() ? b.html : undefined;
  const text = typeof b.text === 'string' && b.text.trim() ? b.text : undefined;
  if (!html && !text) return { ok: false, error: 'one of `html` or `text` is required' };

  const replyTo = b.replyTo === undefined ? undefined : toAddress(b.replyTo);
  if (b.replyTo !== undefined && !replyTo) return { ok: false, error: '`replyTo` is not a valid email address' };

  const headers = sanitizeHeaders(b.headers);
  if (headers === null) return { ok: false, error: '`headers` invalid (name/value format or count)' };

  const attachments = sanitizeAttachments(b.attachments);
  if (attachments === null) return { ok: false, error: '`attachments` invalid (max 32, need filename/type/content)' };

  const value: SendRequest = { to, from, subject };
  if (html) value.html = html;
  if (text) value.text = text;
  if (cc.length) value.cc = cc;
  if (bcc.length) value.bcc = bcc;
  if (replyTo) value.replyTo = replyTo;
  if (headers) value.headers = headers;
  if (attachments.length) value.attachments = attachments;

  return { ok: true, value };
}

/** 粗略估算 MIME 大小，用于提前拦截 5 MiB 限制 */
export function estimateSize(value: SendRequest): number {
  const enc = (s: string | undefined) => (s ? new TextEncoder().encode(s).length : 0);
  let size = enc(value.subject) + enc(value.html) + enc(value.text) + 2048;
  for (const a of value.attachments ?? []) {
    if (typeof a.content === 'string') size += Math.floor((a.content.length * 3) / 4);
    else if (a.content instanceof ArrayBuffer) size += a.content.byteLength;
    else size += a.content.byteLength;
  }
  return size;
}

export const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
