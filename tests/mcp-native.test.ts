import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, until } from './helpers';
import { Store } from '../electron/core/storage/store';
import { Integrations } from '../electron/core/extensions/integrations';
import { Harness } from '../electron/core/agent/harness';
import { mcpContext, nativeNames, type McpServerState } from '../electron/core/extensions/mcp-native';
import type { ModelClient, ToolDefinition } from '../electron/core/model/model';
import type { VmController } from '../electron/core/vm/vm';
import type { WireMessage } from '../shared/types/core';

const tool = (name: string, description = '') => ({ name, description, inputSchema: { type: 'object' as const } });
const server = (id: string, name: string, tools: string[], extra: Partial<McpServerState> = {}): McpServerState => ({
  id,
  name,
  status: 'connected',
  location: '远程',
  tools: tools.map((item) => tool(item)),
  ...extra,
});
const FUNCTION_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

test('MCP tools get stable function names that every provider accepts', () => {
  const servers = [
    server('a', 'Notion', ['search', 'create-page']),
    server('b', 'Notion', ['search']),
    server('c', '内部知识库', ['查找', 'Search', 'search']),
    server('d', 'x'.repeat(80), ['y'.repeat(80)]),
  ];
  const { routes } = nativeNames(servers);
  for (const name of routes.keys()) assert.match(name, FUNCTION_NAME);
  assert.deepEqual(routes.get('mcp__notion__search'), { server: 'a', tool: 'search' });
  assert.deepEqual(routes.get('mcp__notion__create-page'), { server: 'a', tool: 'create-page' });
  // A second server with the same name, and tools whose names differ only in case, stay distinct.
  assert.equal(routes.size, 7);
  assert.equal(new Set([...routes.values()].map((route) => route.server + '/' + route.tool)).size, 7);
  // The same servers give the same names, whatever order they come in.
  assert.deepEqual([...nativeNames([...servers].reverse()).routes].sort(), [...routes].sort());
});

test('whole servers are offered while they fit; the rest are listed by name with their state', () => {
  const servers = [
    server('a', 'Alpha', ['a1', 'a2']),
    server('b', 'Beta', ['b1', 'b2', 'b3']),
    server('c', 'Gamma', [], { status: 'available', tools: undefined }),
    server('d', 'Delta', [], { status: 'error', login: 'signed-out', tools: undefined }),
    server('e', 'Echo', ['e1'], { instructions: '先调用 e1。' + '长'.repeat(2000) }),
  ];
  const offer = mcpContext(servers, { maxTools: 4, maxTokens: 10000 });
  assert.deepEqual(
    offer.tools.map((item) => item.function.name),
    ['mcp__alpha__a1', 'mcp__alpha__a2', 'mcp__echo__e1'],
  );
  assert.equal(offer.tools[0].function.description, '[Alpha] a1');
  assert.equal((offer.tools[0].function.parameters as { type: string }).type, 'object');
  assert.match(offer.prompt, /Alpha（远程）。2 个工具已直接提供，名称以 mcp__alpha__ 开头/);
  assert.match(offer.prompt, /Beta（远程）。3 个工具未直接提供：b1、b2、b3。用 mcp_list_tools/);
  assert.match(offer.prompt, /Gamma（远程）。尚未连接/);
  assert.match(offer.prompt, /Delta（远程）。需要用户先在插件页登录/);
  assert.match(offer.prompt, /\[Echo\] 先调用 e1。/);
  assert.ok(offer.prompt.length < 2500, 'server instructions are cut short');
  assert.deepEqual(mcpContext(servers, { maxTools: 0, maxTokens: 0 }).tools, []);
  assert.equal(mcpContext([], { maxTools: 10, maxTokens: 10000 }).prompt, '');
});

const body = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = '';
    request.on('data', (chunk) => (text += chunk));
    request.on('end', () => resolve(text));
  });
const json = (response: ServerResponse, value: unknown) =>
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));

/** A remote MCP server with one read-only tool and usage instructions. */
async function notesServer(t: test.TestContext) {
  const calls: unknown[] = [];
  const http = createServer(async (request, response) => {
    if (request.method !== 'POST') return response.writeHead(405).end();
    const message = JSON.parse(await body(request));
    if (message.id === undefined) return response.writeHead(202).end();
    if (message.method === 'initialize')
      return json(response, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'notes', version: '1' },
          instructions: '搜索前先确认关键词。',
        },
      });
    if (message.method === 'tools/list')
      return json(response, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'search_notes',
              description: '按关键词搜索笔记',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
              annotations: { readOnlyHint: true },
            },
          ],
        },
      });
    if (message.method === 'tools/call') {
      calls.push(message.params);
      return json(response, {
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: '找到 2 条笔记' }] },
      });
    }
    return json(response, { jsonrpc: '2.0', id: message.id, result: {} });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  t.after(() => http.close());
  return { url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/mcp`, calls };
}

test('a connected server reaches the model as its own tools and server notes, and a call runs it', async (t) => {
  const remote = await notesServer(t);
  const root = tempDir(t, 'aelion-mcp-native-'),
    paths = {
      homeDir: join(root, 'home'),
      projectDir: join(root, 'project'),
      dataDir: join(root, 'data'),
      configDir: join(root, 'aelion'),
      env: {},
    };
  for (const path of Object.values(paths)) if (typeof path === 'string') mkdirSync(path, { recursive: true });
  writeFileSync(join(paths.configDir, 'mcp.json'), JSON.stringify({ mcpServers: { Notes: { url: remote.url } } }));
  const store = new Store(paths.dataDir);
  t.after(() => store.close());
  const integrations = new Integrations(store, paths, () => {});
  t.after(() => integrations.close());
  await integrations.refresh();
  await integrations.mcp.warm();
  assert.equal(integrations.snapshot().servers[0].status, 'connected');

  let offered: ToolDefinition[] = [],
    context = '',
    calls = 0;
  const model = {
    complete: async (messages: WireMessage[], tools: ToolDefinition[]) => {
      if (calls++ === 0) {
        offered = tools;
        context = messages
          .filter((message) => message.role === 'system')
          .map((message) => message.content || '')
          .join('\n');
        return {
          content: '',
          finishReason: 'tool_calls',
          calls: [
            {
              id: 'search',
              type: 'function',
              function: { name: 'mcp__notes__search_notes', arguments: JSON.stringify({ query: '周报' }) },
            },
          ],
        };
      }
      assert.ok(messages.some((message) => message.role === 'tool' && message.content?.includes('找到 2 条笔记')));
      return { content: '找到 2 条周报笔记。', finishReason: 'stop', calls: [] };
    },
  } as unknown as ModelClient;
  store.data.model.model = 'fixture';
  store.data.model.contextTokens = 128000;
  await new Harness(store, {} as VmController, model, () => {}, undefined, undefined, integrations).run(
    store.data.bots[0].id,
    '找一下周报笔记',
  );
  await until(() => store.data.runs[0]?.status !== 'running');
  const native = offered.find((item) => item.function.name === 'mcp__notes__search_notes');
  assert.ok(native, 'the tool is offered under its own name');
  assert.equal(native!.function.description, '[Notes] 按关键词搜索笔记');
  assert.deepEqual((native!.function.parameters as { required: string[] }).required, ['query']);
  assert.match(context, /Notes（远程）。1 个工具已直接提供/);
  assert.match(context, /\[Notes\] 搜索前先确认关键词。/);
  assert.deepEqual(remote.calls, [{ name: 'search_notes', arguments: { query: '周报' } }]);
  assert.equal(store.data.runs[0].status, 'completed');
});
