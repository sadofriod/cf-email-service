import { readFile } from 'node:fs/promises';

const required = ['SEND_API_KEY', 'TEMPLATE', 'TO'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (!process.env.DATA && !process.env.DATA_FILE) throw new Error('DATA or DATA_FILE is required');

const rawData = process.env.DATA ?? await readFile(process.env.DATA_FILE, 'utf8');
let data;
try { data = JSON.parse(rawData); } catch { throw new Error('DATA must contain valid JSON'); }

const baseUrl = process.env.BASE_URL ?? 'https://cf-email-service.next-blog.workers.dev';
const response = await fetch(`${baseUrl}/send`, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.SEND_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ template: process.env.TEMPLATE, to: process.env.TO, data }),
});
let payload;
try { payload = await response.json(); } catch { payload = { error: 'response was not JSON' }; }
console.log(`HTTP ${response.status}`);
console.log(JSON.stringify(payload, null, 2));
process.exitCode = response.ok ? 0 : 1;
