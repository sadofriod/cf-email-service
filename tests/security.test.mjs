import assert from 'node:assert/strict';
import { randomBytes, timingSafeEqual, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const key = randomBytes(32).toString('hex');
const marker = 'PRIVATE-UPSTREAM-CONTENT';
const message = { to: 'recipient@example.com', subject: marker, text: marker };

async function worker(fetch = async () => { throw new Error('unexpected network'); }) {
  const logs = [];
  const context = createContext({
    Request, Response, URL, TextEncoder, fetch,
    crypto: { subtle: {
      digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
      timingSafeEqual: (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b)),
    } },
    console: { log: (...args) => logs.push(args.join(' ')) },
  });
  const modules = new Map();
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const source = await readFile(path, 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = new SourceTextModule(code, { context, identifier: path });
    modules.set(path, module);
    await module.link((specifier, parent) => load(resolve(dirname(parent.identifier), `${specifier}.ts`)));
    return module;
  }
  const module = await load(resolve(root, 'src/index.ts'));
  await module.evaluate();
  return { app: module.namespace.default, logs };
}

const bearer = (value, scheme = 'Bearer') => [scheme, value].join(' ');
function request(header = bearer(key)) {
  return new Request('https://worker.invalid/send', {
    method: 'POST', headers: header === null ? {} : { authorization: header },
    body: JSON.stringify(message),
  });
}

test('unsafe configuration fails closed before any transport', async () => {
  const { app } = await worker();
  const defaults = [
    undefined, '', '   ', 'short-public-sample', 'a'.repeat(64),
    'example-'.repeat(8), 'change_me-'.repeat(8), 'replace-me-'.repeat(8),
    'your-secret-'.repeat(8), 'placeholder-'.repeat(8), `<${key}>`, ` ${key}`,
    `${key}!`, `${key}:`, `${key.slice(0, 16)} ${key.slice(16)}`,
  ];
  for (const value of defaults) {
    let sent = false;
    const response = await app.fetch(request(), {
      SEND_API_KEY: value, EMAIL: { send() { sent = true; } },
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'server_misconfigured');
    assert.equal(sent, false);
  }
});

test('only a valid token sends; no Origin is required', async () => {
  const { app } = await worker();
  let sends = 0;
  const acceptedCharsetKey = 'Aa0._~+/-'.repeat(4);
  const env = { SEND_API_KEY: acceptedCharsetKey, DEFAULT_FROM: 'hello@ashesborn.cloud',
    EMAIL: { async send() { sends++; return { messageId: marker }; } } };
  for (const header of [null, '', 'Bearer', 'Basic abc', bearer(acceptedCharsetKey) + ' extra', bearer('wrong'),
    bearer(acceptedCharsetKey.slice(1)), 'Bearer\t' + acceptedCharsetKey]) {
    assert.equal((await app.fetch(request(header), env)).status, 401);
  }
  assert.equal(sends, 0);
  for (const header of [bearer(acceptedCharsetKey), bearer(acceptedCharsetKey, 'bearer'),
    'BEARER' + '  ' + acceptedCharsetKey]) {
    const response = await app.fetch(request(header), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, via: 'binding' });
  }
  assert.equal(sends, 3);
});

test('no transport and health disclose no configuration', async () => {
  const { app } = await worker();
  const env = { SEND_API_KEY: key, DEFAULT_FROM: 'hello@ashesborn.cloud' };
  assert.equal((await app.fetch(request(), env)).status, 503);
  assert.deepEqual(await (await app.fetch(new Request('https://worker.invalid/health'), env)).json(), { ok: true });
});

test('binding errors and subjects never leak, including forged mapped errors', async () => {
  const { app, logs } = await worker();
  for (const code of [marker, 'constructor', '__proto__', 'E_RATE_LIMIT_EXCEEDED']) {
    const response = await app.fetch(request(), {
      SEND_API_KEY: key, DEFAULT_FROM: 'hello@ashesborn.cloud',
      EMAIL: { async send() { throw { code, message: marker,
        mapped: { status: 500, code: marker, message: marker } }; } },
    });
    assert.equal(response.status, code === 'E_RATE_LIMIT_EXCEEDED' ? 429 : 500);
    const text = await response.text();
    assert.ok(!text.includes(marker));
    assert.ok(!text.includes(key));
  }
  assert.ok(!logs.join('').includes(marker));
  assert.ok(!logs.join('').includes(key));
});

test('REST errors, malformed replies and success objects are not reflected', async () => {
  for (const errors of [[{ code: marker, message: marker }], [null], [{ code: 10102, message: marker }], [{ code: '10102', message: marker }]]) {
    const { app, logs } = await worker(async () => Response.json({ success: false, errors }, { status: 403 }));
    const response = await app.fetch(request(), {
      SEND_API_KEY: key, DEFAULT_FROM: 'hello@ashesborn.cloud', CF_ACCOUNT_ID: 'test-account', CF_API_TOKEN: marker,
    });
    assert.equal(response.status, errors[0]?.code === 10102 || errors[0]?.code === '10102' ? 403 : 502);
    assert.ok(!(await response.text()).includes(marker));
    assert.ok(!logs.join('').includes(marker));
  }
  for (const reply of [
    async () => { throw new Error(marker); },
    async () => new Response(marker),
    async () => Response.json({ success: true, result: { token: marker } }),
  ]) {
    const { app, logs } = await worker(reply);
    const response = await app.fetch(request(), {
      SEND_API_KEY: key, DEFAULT_FROM: 'hello@ashesborn.cloud', CF_ACCOUNT_ID: 'test-account', CF_API_TOKEN: marker,
    });
    assert.ok(!(await response.text()).includes(marker));
    assert.ok(!logs.join('').includes(marker));
  }
});

async function cli(name, env, { fail = false, success = true } = {}) {
  const logs = [];
  let calls = 0;
  const process = { env, exitCode: 0, exit(code) { this.exitCode = code; throw new Error('exit'); } };
  const context = createContext({
    process, console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    fetch: async () => {
      calls++;
      if (fail) throw new Error(marker);
      return Response.json({ success, errors: [{ code: marker, message: marker }], result: { token: marker } },
        { status: success ? 200 : 403 });
    },
  });
  const module = new SourceTextModule(await readFile(resolve(root, `scripts/send-${name}.mjs`), 'utf8'), { context });
  await module.link((specifier) => {
    assert.equal(specifier, 'nodemailer');
    return new SyntheticModule(['default'], function () {
      this.setExport('default', { createTransport() {
        return { async sendMail() {
          calls++;
          if (fail) throw { code: marker, message: marker };
          return { messageId: marker, response: marker };
        } };
      } });
    }, { context });
  });
  try { await module.evaluate(); } catch (error) {
    if (error.message !== 'exit') throw error;
  }
  return { output: logs.join('\n'), calls, code: process.exitCode };
}

for (const name of ['rest', 'smtp']) {
  test(`${name} CLI requires explicit TO and credentials without sending`, async () => {
    for (const env of [{}, { CF_ACCOUNT_ID: 'test', CF_API_TOKEN: marker },
      { CF_ACCOUNT_ID: 'test', CF_API_TOKEN: marker, TO: '  ' },
      { CF_ACCOUNT_ID: 'test', CF_API_TOKEN: ' ', TO: 'recipient@example.com' }]) {
      const result = await cli(name, env);
      assert.equal(result.code, 1);
      assert.equal(result.calls, 0);
      assert.ok(!result.output.includes(marker));
    }
  });
  test(`${name} CLI redacts all upstream output`, async () => {
    for (const options of [{}, { fail: true }, { success: false }]) {
      const result = await cli(name, {
        CF_ACCOUNT_ID: 'test', CF_API_TOKEN: marker, TO: 'recipient@example.com',
      }, options);
      assert.equal(result.calls, 1);
      assert.equal(result.code, options.fail || (name === 'rest' && options.success === false) ? 1 : 0);
      assert.ok(!result.output.includes(marker));
    }
  });
}
