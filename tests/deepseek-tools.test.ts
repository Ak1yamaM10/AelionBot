import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { deepseekTransport } from '../electron/core/extensions/deepseek-tools';
import { appConnectorFor } from '../shared/app-connectors';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers';
import { Store } from '../electron/core/storage/store';
import { Integrations } from '../electron/core/extensions/integrations';

async function connect(respond: (path: string, body: any) => { status?: number; json: unknown }) {
  const calls: Array<{ path: string; body: any; auth: string | null }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input)),
      body = JSON.parse(String(init?.body));
    calls.push({ path: url.pathname, body, auth: new Headers(init?.headers).get('authorization') });
    const reply = respond(url.pathname, body);
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200 });
  }) as typeof fetch;
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(await deepseekTransport('sk-test'));
  return {
    client,
    calls,
    text: async (name: string, args: Record<string, unknown>) => {
      const result: any = await client.callTool({ name, arguments: args });
      return { text: result.content[0].text as string, isError: result.isError === true };
    },
    close: async () => {
      globalThis.fetch = original;
      await client.close();
    },
  };
}

test('DeepSeek is a token app in the catalog served inside the app', () => {
  const app = appConnectorFor('https://api.deepseek.com/v1/tools/');
  assert.equal(app?.id, 'deepseek');
  assert.equal(app?.auth, 'token');
  assert.equal(app?.builtin, true);
});

test('DeepSeek search sends the key and formats results for the model', async () => {
  const server = await connect(() => ({
    json: {
      results: [
        {
          rerank_score: 2.1,
          title: 'DeepSeek API',
          url: 'https://api-docs.deepseek.com/',
          snippet: 'short',
          summary: 'long summary',
          content: 'x'.repeat(5000),
          site_name: 'DeepSeek',
          date: '2026-10-01T00:00:00Z',
          authority: 3,
        },
      ],
    },
  }));
  try {
    const { tools } = await server.client.listTools();
    assert.deepEqual(
      tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint]),
      [
        ['search', true],
        ['fetch', true],
      ],
    );
    const result = await server.text('search', { query: 'deepseek site:deepseek.com', need_content: true });
    assert.equal(server.calls[0].path, '/v1/tools/search');
    assert.equal(server.calls[0].auth, 'Bearer sk-test');
    assert.deepEqual(server.calls[0].body, { query: 'deepseek site:deepseek.com', count: 10, need_content: true });
    assert.equal(result.isError, false);
    assert.match(result.text, /^1\. DeepSeek API\nhttps:\/\/api-docs\.deepseek\.com\/\nDeepSeek · 2026-10-01/);
    assert.match(result.text, /long summary/);
    assert.match(result.text, /正文已截断/);
    assert.ok(result.text.length < 4500);
  } finally {
    await server.close();
  }
});

test('DeepSeek fetch pages long content from one request', async () => {
  const server = await connect(() => ({ json: { title: 'Page', content: 'a'.repeat(150) + 'b'.repeat(100) } }));
  try {
    const first = await server.text('fetch', { url: 'https://example.com/', max_chars: 150 });
    assert.match(first.text, /^# Page\nhttps:\/\/example\.com\/\n\na{150}\n\n.*offset=150/);
    const second = await server.text('fetch', { url: 'https://example.com/', offset: 150, max_chars: 150 });
    assert.match(second.text, /b{100}$/);
    assert.equal(server.calls.length, 1);
    assert.deepEqual(server.calls[0].body, { url: 'https://example.com/' });
  } finally {
    await server.close();
  }
});

test('DeepSeek API errors come back as tool errors', async () => {
  const server = await connect(() => ({
    status: 402,
    json: { error: { message: 'Insufficient Balance', type: 'invalid_request_error', param: null, code: 'x' } },
  }));
  try {
    const result = await server.text('search', { query: 'test' });
    assert.equal(result.isError, true);
    assert.match(result.text, /余额不足.*Insufficient Balance/);
  } finally {
    await server.close();
  }
});

test('adding DeepSeek with an API key offers its tools without a remote MCP server', async (t) => {
  const root = tempDir(t, 'aelion-deepseek-'),
    paths = {
      homeDir: join(root, 'home'),
      projectDir: join(root, 'project'),
      dataDir: join(root, 'data'),
      configDir: join(root, 'aelion'),
      env: {},
    };
  for (const path of Object.values(paths)) if (typeof path === 'string') mkdirSync(path, { recursive: true });
  const store = new Store(paths.dataDir);
  t.after(() => store.close());
  const codec = {
    encrypt: (value: string) => 'enc:' + Buffer.from(value).toString('base64'),
    decrypt: (value: string) => Buffer.from(value.slice(4), 'base64').toString(),
  };
  const integrations = new Integrations(store, paths, () => {}, undefined, codec);
  t.after(() => integrations.close());
  const id = await integrations.addApp({ app: 'deepseek', token: 'sk-test' });
  const view = integrations.snapshot().servers.find((server) => server.id === id)!;
  assert.equal(view.app, 'deepseek');
  assert.equal(view.login, 'signed-in');
  assert.deepEqual(
    (await integrations.mcp.listTools(id)).tools.map((tool) => tool.name),
    ['search', 'fetch'],
  );
  assert.ok(!readFileSync(join(paths.dataDir, 'mcp-auth.json'), 'utf8').includes('sk-test'));

  await integrations.signOut(id);
  await assert.rejects(integrations.mcp.listTools(id), /需要登录/);
});
