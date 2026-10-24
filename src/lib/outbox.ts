import type { Env } from '../types';

const METADATA_TTL_SECONDS = 90 * 24 * 60 * 60;
const BODY_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_TIMESTAMP = 9_999_999_999_999;

export const OUTBOX_PREFIX = 'm1:';
export const OUTBOX_KEY_PREFIX_LEN = OUTBOX_PREFIX.length;
const OUTBOX_BODY_PREFIX = 'b1:';

export interface OutboxEntry {
  ts?: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  from: string;
  subject: string;
  template?: string;
  domain?: string;
  locale?: string;
  via: 'binding' | 'rest';
  status: 'sent' | 'failed';
  messageId?: string;
  error?: { code: string; message: string };
  bytes: number;
  html?: string;
  text?: string;
}

export interface OutboxMetadata extends Omit<OutboxEntry, 'html' | 'text' | 'ts'> {
  ts: number;
  key: string;
  bodyTruncated?: boolean;
}

export interface OutboxItem extends OutboxMetadata {
  bodyExpired?: boolean;
}

export interface OutboxDetail extends OutboxItem {
  body?: { html?: string; text?: string };
}

function bodyByteLength(html?: string, text?: string): number {
  return new TextEncoder().encode(`${html ?? ''}${text ?? ''}`).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

export async function recordOutbox(env: Env, entry: OutboxEntry): Promise<void> {
  if (!env.OUTBOX) return;
  const ts = entry.ts ?? Date.now();
  const suffix = entry.messageId || crypto.randomUUID();
  const keySuffix = `${String(MAX_TIMESTAMP - ts).padStart(13, '0')}:${suffix}`;
  const key = `${OUTBOX_PREFIX}${keySuffix}`;
  const bodyBytes = bodyByteLength(entry.html, entry.text);
  const bodyTruncated = bodyBytes > MAX_BODY_BYTES;
  let html = entry.html;
  let text = entry.text;
  if (bodyTruncated) {
    // Preserve the leading 512 KiB across both representations for diagnosis.
    const htmlBytes = new TextEncoder().encode(html ?? '').byteLength;
    html = truncateUtf8(html ?? '', MAX_BODY_BYTES);
    text = truncateUtf8(text ?? '', Math.max(0, MAX_BODY_BYTES - Math.min(htmlBytes, MAX_BODY_BYTES)));
  }
  const metadata: OutboxMetadata = {
    ts,
    key,
    to: entry.to,
    ...(entry.cc?.length ? { cc: entry.cc } : {}),
    ...(entry.bcc?.length ? { bcc: entry.bcc } : {}),
    from: entry.from,
    subject: entry.subject,
    ...(entry.template ? { template: entry.template } : {}),
    ...(entry.domain ? { domain: entry.domain } : {}),
    ...(entry.locale ? { locale: entry.locale } : {}),
    via: entry.via,
    status: entry.status,
    ...(entry.messageId ? { messageId: entry.messageId } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    bytes: entry.bytes,
    ...(bodyTruncated ? { bodyTruncated: true } : {}),
  };
  await env.OUTBOX.put(key, JSON.stringify(metadata), { expirationTtl: METADATA_TTL_SECONDS });
  if (html !== undefined || text !== undefined) {
    await env.OUTBOX.put(`${OUTBOX_BODY_PREFIX}${keySuffix}`, JSON.stringify({ ...(html !== undefined ? { html } : {}), ...(text !== undefined ? { text } : {}) }), { expirationTtl: BODY_TTL_SECONDS });
  }
}

export async function listOutbox(env: Env, limit: number, cursor?: string): Promise<{ items: OutboxItem[]; cursor?: string }> {
  if (!env.OUTBOX) return { items: [] };
  const result = await env.OUTBOX.list({ prefix: OUTBOX_PREFIX, limit, ...(cursor ? { cursor } : {}) });
  const items = (await Promise.all(result.keys.map(async ({ name }) => {
    const value = await env.OUTBOX!.get<OutboxMetadata>(name, 'json');
    if (!value) return null;
    const body = await env.OUTBOX!.get(`${OUTBOX_BODY_PREFIX}${name.slice(OUTBOX_KEY_PREFIX_LEN)}`);
    return { ...value, key: name, ...(body === null ? { bodyExpired: true } : {}) };
  }))).filter((item): item is OutboxItem => item !== null);
  items.sort((a, b) => b.ts - a.ts || b.key.localeCompare(a.key));
  return { items, ...(result.list_complete ? {} : { cursor: result.cursor }) };
}

export async function countOutbox(env: Env): Promise<number> {
  if (!env.OUTBOX) return 0;
  let count = 0;
  let cursor: string | undefined;
  do {
    const result = await env.OUTBOX.list({ prefix: OUTBOX_PREFIX, limit: 1_000, ...(cursor ? { cursor } : {}) });
    count += result.keys.length;
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return count;
}

export async function getOutbox(env: Env, key: string): Promise<OutboxDetail | null> {
  if (!env.OUTBOX) return null;
  const metadata = await env.OUTBOX.get<OutboxMetadata>(`${OUTBOX_PREFIX}${key}`, 'json');
  if (!metadata) return null;
  const body = await env.OUTBOX.get<{ html?: string; text?: string }>(`${OUTBOX_BODY_PREFIX}${key}`, 'json');
  return body ? { ...metadata, key: `${OUTBOX_PREFIX}${key}`, body } : { ...metadata, key: `${OUTBOX_PREFIX}${key}`, bodyExpired: true };
}
