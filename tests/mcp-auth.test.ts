import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers';
import { Store } from '../electron/core/storage/store';
import { Integrations } from '../electron/core/extensions/integrations';

// Stands in for the system key store; the marker shows nothing was written in the clear.
const codec = {
  encrypt: (value: string) => 'enc:' + Buffer.from(value).toString('base64'),
  decrypt: (value: string) => Buffer.from(value.slice(4), 'base64').toString(),
};

const body = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = '';
    request.on('data', (chunk) => (text += chunk));
    request.on('end', () => resolve(text));
  });
const json = (response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) =>
  response.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(value));

/** A remote MCP server behind OAuth with dynamic client registration, PKCE and refresh tokens. */
async function oauthServer(t: test.TestContext) {
  const state = { valid: 'access-1', registered: [] as string[], refreshed: 0, challenge: '' };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, base);
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp')
      return json(response, 200, {
        resource: base + '/mcp',
        authorization_servers: [base],
        scopes_supported: ['read'],
      });
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return json(response, 200, {
        issuer: base,
        authorization_endpoint: base + '/authorize',
        token_endpoint: base + '/token',
        registration_endpoint: base + '/register',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    if (url.pathname === '/register') {
      const client = JSON.parse(await body(request));
      state.registered.push(...client.redirect_uris);
      return json(response, 201, { ...client, client_id: 'client-1' });
    }
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('client_id'), 'client-1');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      state.challenge = url.searchParams.get('code_challenge')!;
      const back = new URL(url.searchParams.get('redirect_uri')!);
      back.searchParams.set('code', 'code-1');
      back.searchParams.set('state', url.searchParams.get('state')!);
      return response.writeHead(302, { location: back.href }).end();
    }
    if (url.pathname === '/token') {
      const form = new URLSearchParams(await body(request));
      if (form.get('grant_type') === 'authorization_code') {
        const hash = createHash('sha256').update(form.get('code_verifier')!).digest('base64url');
        if (form.get('code') !== 'code-1' || hash !== state.challenge)
          return json(response, 400, { error: 'invalid_grant' });
        return json(response, 200, { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'Bearer' });
      }
      assert.equal(form.get('refresh_token'), 'refresh-1');
      state.refreshed++;
      return json(response, 200, { access_token: state.valid, token_type: 'Bearer' });
    }
    if (url.pathname !== '/mcp') return response.writeHead(404).end();
    if (request.headers.authorization !== `Bearer ${state.valid}`)
      return json(
        response,
        401,
        { error: 'invalid_token' },
        {
          'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
        },
      );
    if (request.method !== 'POST') return response.writeHead(405).end();
    const message = JSON.parse(await body(request));
    if (message.id === undefined) return response.writeHead(202).end();
    const result =
      message.method === 'initialize'
        ? {
            protocolVersion: message.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'notes', version: '1' },
          }
        : message.method === 'tools/list'
          ? { tools: [{ name: 'search_notes', inputSchema: { type: 'object', properties: {} } }] }
          : {};
    return json(response, 200, { jsonrpc: '2.0', id: message.id, result });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  t.after(() => server.close());
  return { base, state };
}

function setup(t: test.TestContext, servers: Record<string, unknown>) {
  const root = tempDir(t, 'aelion-mcp-auth-'),
    paths = {
      homeDir: join(root, 'home'),
      projectDir: join(root, 'project'),
      dataDir: join(root, 'data'),
      configDir: join(root, 'aelion'),
      env: {},
    };
  for (const path of [paths.homeDir, paths.projectDir, paths.dataDir, paths.configDir])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(paths.configDir, 'mcp.json'), JSON.stringify({ mcpServers: servers }));
  const store = new Store(paths.dataDir);
  t.after(() => store.close());
  const integrations = new Integrations(store, paths, () => {}, undefined, codec);
  t.after(() => integrations.close());
  return { paths, integrations };
}

test('signing in to a remote MCP server registers the app, keeps encrypted tokens and refreshes them', async (t) => {
  const remote = await oauthServer(t);
  const { paths, integrations } = setup(t, { notes: { type: 'http', url: remote.base + '/mcp' } });
  await integrations.refresh();
  const id = integrations.snapshot().servers[0].id;
  assert.equal(integrations.snapshot().servers[0].login, 'signed-out');
  await assert.rejects(integrations.mcp.listTools(id), /需要登录/);

  // The browser: follow the sign-in page back to the app's loopback address.
  let opened = 0;
  await integrations.signIn(id, async (url) => {
    opened++;
    await fetch(url, { redirect: 'follow' });
  });
  assert.equal(opened, 1);
  assert.equal(remote.state.registered.length, 1);
  assert.match(remote.state.registered[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(integrations.snapshot().servers[0].login, 'signed-in');
  assert.deepEqual(
    (await integrations.mcp.listTools(id)).tools.map((tool) => tool.name),
    ['search_notes'],
  );
  const saved = readFileSync(join(paths.dataDir, 'mcp-auth.json'), 'utf8');
  assert.ok(!saved.includes('access-1') && !saved.includes('refresh-1') && !saved.includes('client-1'));

  // The access token expires: the next connection refreshes it without the browser.
  remote.state.valid = 'access-2';
  await integrations.mcp.disconnect(id);
  assert.equal((await integrations.mcp.listTools(id)).total, 1);
  assert.equal(remote.state.refreshed, 1);
  assert.equal(opened, 1);

  await integrations.signOut(id);
  assert.equal(integrations.snapshot().servers[0].login, 'signed-out');
  await assert.rejects(integrations.mcp.listTools(id), /需要登录/);
});

test('a cancelled sign-in stops waiting and leaves the server signed out', async (t) => {
  const remote = await oauthServer(t);
  const { integrations } = setup(t, { notes: { type: 'http', url: remote.base + '/mcp' } });
  await integrations.refresh();
  const id = integrations.snapshot().servers[0].id;
  // The person never comes back from the browser.
  const pending = integrations.signIn(id, () => {
    setImmediate(() => integrations.cancelSignIn(id));
  });
  await assert.rejects(pending, { code: 'mcp.signin_cancelled' });
  assert.equal(integrations.snapshot().servers[0].login, 'signed-out');
});

test('catalog apps are added to the app config with their token or Google client, and removed with them', async (t) => {
  const { paths, integrations } = setup(t, {});
  await integrations.refresh();
  await assert.rejects(integrations.addApp({ app: 'github' }), { code: 'mcp.token_invalid' });
  const github = await integrations.addApp({ app: 'github', token: 'github_pat_example' });
  let view = integrations.snapshot().servers.find((server) => server.id === github)!;
  assert.equal(view.app, 'github');
  assert.equal(view.login, 'signed-in');
  assert.equal(view.enabled, true);
  assert.ok(!readFileSync(join(paths.dataDir, 'mcp-auth.json'), 'utf8').includes('github_pat_example'));
  assert.ok(!readFileSync(join(paths.configDir, 'mcp.json'), 'utf8').includes('github_pat_example'));
  // Adding it again keeps one entry.
  assert.equal(await integrations.addApp({ app: 'github', token: 'github_pat_other' }), github);

  await assert.rejects(integrations.addApp({ app: 'gmail' }), { code: 'mcp.google_client_invalid' });
  await integrations.addApp({ app: 'gmail', clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'secret' });
  assert.deepEqual(integrations.snapshot().ownClients, ['google']);
  // The saved client serves the next Google app.
  const drive = await integrations.addApp({ app: 'google-drive' });
  view = integrations.snapshot().servers.find((server) => server.id === drive)!;
  assert.equal(view.login, 'signed-out');

  await integrations.remove(github);
  assert.ok(!integrations.snapshot().servers.some((server) => server.app === 'github'));
  assert.equal(JSON.parse(readFileSync(join(paths.configDir, 'mcp.json'), 'utf8')).mcpServers.GitHub, undefined);
});
