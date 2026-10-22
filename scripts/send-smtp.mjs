#!/usr/bin/env node
/**
 * 用 Cloudflare Email Service 的 SMTP 端点发邮件（适合已有 SMTP 库的老项目）。
 *
 *   Host: smtp.mx.cloudflare.net   Port: 465 (implicit TLS)
 *   user: "api_token"              pass: <Cloudflare API token, Email Sending: Edit>
 *
 * 用法：
 *   CF_API_TOKEN=yyy node scripts/send-smtp.mjs
 *   TO=a@b.com FROM=hello@ashesborn.cloud SUBJECT=hi TEXT=hello node scripts/send-smtp.mjs
 */
import nodemailer from 'nodemailer';

const API_TOKEN = process.env.CF_API_TOKEN;
if (!API_TOKEN) {
  console.error('missing env: CF_API_TOKEN');
  process.exit(1);
}

const TO = process.env.TO ?? 'justlikeashes@gmail.com';
const FROM = process.env.FROM ?? 'hello@ashesborn.cloud';
const SUBJECT = process.env.SUBJECT ?? 'Cloudflare Email Service SMTP test';
const TEXT = process.env.TEXT ?? 'This is a test email sent through smtp.mx.cloudflare.net.';

const transporter = nodemailer.createTransport({
  host: 'smtp.mx.cloudflare.net',
  port: 465,
  secure: true, // 隐式 TLS，不支持 587/STARTTLS
  auth: { user: 'api_token', pass: API_TOKEN },
});

try {
  const info = await transporter.sendMail({
    from: FROM,
    to: TO,
    subject: SUBJECT,
    text: TEXT,
    html: `<h1>It works</h1><p>${TEXT}</p>`,
  });
  console.log(JSON.stringify({ success: true, messageId: info.messageId, response: info.response }, null, 2));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ success: false, code: err?.code ?? null, message: err?.message ?? String(err) }, null, 2));
  process.exit(1);
}
