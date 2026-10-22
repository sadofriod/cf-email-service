#!/usr/bin/env node
/**
 * 用 Email Sending REST API 发一封邮件（不依赖 Worker，任何后端都能这么调）。
 *
 * 用法：
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=yyy node scripts/send-rest.mjs
 *   TO=a@b.com FROM=hello@ashesborn.cloud SUBJECT=hi TEXT=hello node scripts/send-rest.mjs
 *
 * 退出码：0 成功，1 失败。
 */
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;

const TO = process.env.TO ?? 'justlikeashes@gmail.com';
const FROM = process.env.FROM ?? 'hello@ashesborn.cloud';
const SUBJECT = process.env.SUBJECT ?? 'Cloudflare Email Service test';
const TEXT = process.env.TEXT ?? 'This is a test email sent through the Cloudflare Email Sending REST API.';
const HTML = process.env.HTML ?? `<h1>It works</h1><p>${TEXT}</p>`;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('missing env: CF_ACCOUNT_ID and/or CF_API_TOKEN');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;
const payload = { to: TO, from: FROM, subject: SUBJECT, text: TEXT, html: HTML };

const started = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await res.json().catch(() => ({}));
const elapsed = Date.now() - started;

const out = {
  http_status: res.status,
  elapsed_ms: elapsed,
  success: Boolean(body.success),
  result: body.result ?? null,
  errors: body.errors ?? null,
};
console.log(JSON.stringify(out, null, 2));

if (res.ok && body.success) {
  const r = body.result ?? {};
  console.log(`\ndelivered: ${JSON.stringify(r.delivered ?? [])}`);
  console.log(`queued:    ${JSON.stringify(r.queued ?? [])}`);
  console.log(`bounced:   ${JSON.stringify(r.permanent_bounces ?? [])}`);
  process.exit(0);
}
process.exit(1);
