#!/usr/bin/env node
/**
 * 用 Email Sending REST API 发一封邮件（不依赖 Worker，任何后端都能这么调）。
 *
 * 用法：
 *   TO=recipient@example.com node scripts/send-rest.mjs
 *   CF_ACCOUNT_ID / CF_API_TOKEN 必须通过本地安全环境配置。
 *   TO=a@b.com FROM=hello@ashesborn.cloud SUBJECT=hi TEXT=hello node scripts/send-rest.mjs
 *
 * 退出码：0 成功，1 失败。
 */
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;

const TO = process.env.TO?.trim();
const FROM = process.env.FROM ?? 'hello@ashesborn.cloud';
const SUBJECT = process.env.SUBJECT ?? 'Cloudflare Email Service test';
const TEXT = process.env.TEXT ?? 'This is a test email sent through the Cloudflare Email Sending REST API.';
const HTML = process.env.HTML ?? `<h1>It works</h1><p>${TEXT}</p>`;

if (!ACCOUNT_ID?.trim() || !API_TOKEN?.trim() || !TO) {
  console.error('missing env: CF_ACCOUNT_ID, CF_API_TOKEN and TO are required');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;
const payload = { to: TO, from: FROM, subject: SUBJECT, text: TEXT, html: HTML };

try {
  const res = await fetch(url, {
    method: 'POST',
  headers: { authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (res.ok && body?.success === true) {
    console.log(JSON.stringify({ success: true }));
  } else {
    console.error(JSON.stringify({ success: false, code: 'send_failed', http_status: res.status }));
    process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({ success: false, code: 'send_failed' }));
  process.exitCode = 1;
}
