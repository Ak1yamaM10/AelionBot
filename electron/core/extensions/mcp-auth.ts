// Sign-in for remote MCP servers: OAuth in the person's browser with a loopback redirect, or an access token they
// paste. Everything is kept per server address and encrypted with the system key store, so a token only ever goes
// to the address it was issued for.
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { OAUTH_REDIRECT_PORT, OAUTH_REDIRECT_URL, sameServerUrl } from '../../../shared/app-connectors';
import { AppError } from '../../../shared/errors';
import { atomicJson } from '../storage/store';

export interface SecretCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
}
/** What is kept for one server address. */
interface AuthRecord {
  serverUrl: string;
  /** A token the person pasted, sent as a bearer token. */
  token?: string;
  /** The client the app registered with the server, or the person's own (Google). */
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  discovery?: OAuthDiscoveryState;
}
/** A client the person created themselves, used for every server of that provider. */
export interface OwnClient {
  client_id: string;
  client_secret?: string;
}
interface StoredFile {
  version: 1;
  /** Encrypted AuthRecord JSON, by server address. */
  servers: Record<string, string>;
  /** Encrypted OwnClient JSON, by provider. */
  clients: Record<string, string>;
}

export class McpAuthStore {
  private data: StoredFile = { version: 1, servers: {}, clients: {} };
  constructor(
    private file: string,
    private codec: SecretCodec,
  ) {
    try {
      if (existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        if (saved?.version === 1)
          this.data = { version: 1, servers: { ...saved.servers }, clients: { ...saved.clients } };
      }
    } catch {
      /* An unreadable file only means signing in again. */
    }
  }
  private key(url: string) {
    return Object.keys(this.data.servers).find((key) => sameServerUrl(key, url)) || url;
  }
  get(url: string): AuthRecord | undefined {
    const stored = this.data.servers[this.key(url)];
    if (!stored) return;
    try {
      const record = JSON.parse(this.codec.decrypt(stored)) as AuthRecord;
      return sameServerUrl(record.serverUrl, url) ? record : undefined;
    } catch {
      return;
    }
  }
  update(url: string, change: (record: AuthRecord) => void) {
    const record = this.get(url) || { serverUrl: url };
    change(record);
    this.data.servers[this.key(url)] = this.codec.encrypt(JSON.stringify(record));
    this.save();
  }
  delete(url: string) {
    delete this.data.servers[this.key(url)];
    this.save();
  }
  /** Signed in: OAuth tokens or a pasted token. */
  signedIn(url: string) {
    const record = this.get(url);
    return Boolean(record?.token || record?.tokens?.access_token);
  }
  ownClient(provider: string): OwnClient | undefined {
    const stored = this.data.clients[provider];
    if (!stored) return;
    try {
      return JSON.parse(this.codec.decrypt(stored));
    } catch {
      return;
    }
  }
  setOwnClient(provider: string, client: OwnClient) {
    this.data.clients[provider] = this.codec.encrypt(JSON.stringify(client));
    this.save();
  }
  private save() {
    atomicJson(this.file, this.data);
  }
}

/**
 * The SDK's view of one server's credentials. While a Bot works it is not interactive: when the server wants a new
 * sign-in it records that instead of opening a browser, and the person signs in from the plugins page.
 */
class McpOAuthProvider implements OAuthClientProvider {
  needsSignIn = false;
  private verifier = '';
  private expectedState = '';
  constructor(
    private store: McpAuthStore,
    private serverUrl: string,
    private options: {
      redirectUrl: string;
      ownClient?: OwnClient;
      /** Opens the sign-in page; absent while Bots work. */
      open?: (url: URL) => void | Promise<void>;
      /** Extra parameters on the sign-in page, such as Google's offline access. */
      authorizationParams?: Record<string, string>;
    },
  ) {}
  get redirectUrl() {
    return this.options.redirectUrl;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AelionBot',
      client_uri: 'https://aelion.chat',
      redirect_uris: [this.options.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() {
    this.expectedState = randomBytes(16).toString('hex');
    return this.expectedState;
  }
  checkState(state: string | null) {
    return Boolean(this.expectedState) && state === this.expectedState;
  }
  clientInformation() {
    if (this.options.ownClient) return this.options.ownClient;
    const client = this.store.get(this.serverUrl)?.client;
    // A client registered for another redirect cannot finish this sign-in; register again.
    const uris = (client as { redirect_uris?: string[] } | undefined)?.redirect_uris;
    return client && (!uris || uris.includes(this.options.redirectUrl)) ? client : undefined;
  }
  saveClientInformation(client: OAuthClientInformationMixed) {
    this.store.update(this.serverUrl, (record) => (record.client = client));
  }
  tokens() {
    return this.store.get(this.serverUrl)?.tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    this.store.update(this.serverUrl, (record) => {
      // A refresh may come without a new refresh token; the old one stays valid.
      record.tokens = { ...tokens, refresh_token: tokens.refresh_token || record.tokens?.refresh_token };
    });
  }
  async redirectToAuthorization(url: URL) {
    if (!this.options.open) {
      this.needsSignIn = true;
      return;
    }
    for (const [key, value] of Object.entries(this.options.authorizationParams || {})) url.searchParams.set(key, value);
    await this.options.open(url);
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    if (!this.verifier) throw new Error('登录已过期，请重新登录');
    return this.verifier;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'verifier') {
      this.verifier = '';
      return;
    }
    this.store.update(this.serverUrl, (record) => {
      if (scope === 'all' || scope === 'client') delete record.client;
      if (scope === 'all' || scope === 'tokens') delete record.tokens;
      if (scope === 'all' || scope === 'discovery') delete record.discovery;
    });
  }
  discoveryState() {
    return this.store.get(this.serverUrl)?.discovery;
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.store.update(this.serverUrl, (record) => (record.discovery = state));
  }
}

/** The provider a connection uses while Bots work: it refreshes tokens but never opens a browser. */
export function backgroundProvider(store: McpAuthStore, serverUrl: string, ownClient?: OwnClient) {
  // The redirect the client was registered with; another one would make the SDK register a new client.
  const client = store.get(serverUrl)?.client as { redirect_uris?: string[] } | undefined;
  return new McpOAuthProvider(store, serverUrl, {
    redirectUrl: client?.redirect_uris?.[0] || OAUTH_REDIRECT_URL,
    ownClient,
  });
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f6f5f8;color:#29282c}main{max-width:420px;padding:32px;text-align:center}h1{font-size:20px;font-weight:600}p{color:#6b6873}</style><main><h1>${title}</h1><p>${body}</p></main>`;

/**
 * Waits for the browser to come back to the loopback address with an authorization code. A client the app
 * registers itself can use any free port; a person's own client lists one exact address, so it gets no fallback.
 */
async function listen(port: number, fallback: boolean) {
  let server: Server;
  let deliver!: (url: URL) => void;
  const arrived = new Promise<URL>((resolve) => (deliver = resolve));
  const tryPort = (value: number) =>
    new Promise<Server>((resolve, reject) => {
      const candidate = createServer((request, response) => {
        const url = new URL(request.url || '/', `http://127.0.0.1`);
        if (url.pathname !== '/callback') {
          response.writeHead(404).end();
          return;
        }
        const failed = url.searchParams.get('error');
        response
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(
            failed
              ? page('没有完成登录', '可以关掉这个页面，回到 AelionBot 重试。')
              : page('已登录', '可以关掉这个页面，回到 AelionBot。'),
          );
        deliver(url);
      });
      candidate.once('error', reject);
      candidate.listen(value, '127.0.0.1', () => resolve(candidate));
    });
  try {
    server = await tryPort(port);
  } catch (error) {
    if (!fallback) throw error;
    server = await tryPort(0);
  }
  const address = server.address();
  return {
    redirectUrl: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/callback`,
    arrived,
    close: () => server.close(),
  };
}

export interface SignInOptions {
  serverUrl: string;
  /** Instead of everything the server lists. */
  scope?: string;
  ownClient?: OwnClient;
  authorizationParams?: Record<string, string>;
  open: (url: URL) => void | Promise<void>;
  signal: AbortSignal;
  /** The loopback port; tests pass 0 for any free one. */
  port?: number;
  timeoutMs?: number;
}
/** Signs in to one server: registers the app where needed, opens the browser and stores the tokens. */
export async function signIn(store: McpAuthStore, options: SignInOptions) {
  let loopback: Awaited<ReturnType<typeof listen>>;
  try {
    loopback = await listen(options.port ?? OAUTH_REDIRECT_PORT, !options.ownClient);
  } catch {
    throw new AppError(
      'mcp.signin_port_busy',
      `登录需要的本机端口 ${OAUTH_REDIRECT_PORT} 被占用，请关闭占用它的程序后重试`,
    );
  }
  try {
    const provider = new McpOAuthProvider(store, options.serverUrl, {
      redirectUrl: loopback.redirectUrl,
      ownClient: options.ownClient,
      open: options.open,
      authorizationParams: options.authorizationParams,
    });
    const first = await auth(provider, { serverUrl: options.serverUrl, scope: options.scope });
    if (first === 'AUTHORIZED') return;
    let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new AppError('mcp.signin_timeout', '登录超时，请重新登录')),
        options.timeoutMs ?? 10 * 60_000,
      );
      abort = () => reject(new AppError('mcp.signin_cancelled', '已取消登录'));
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    });
    const callback = await Promise.race([loopback.arrived, stopped]).finally(() => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort!);
    });
    const error = callback.searchParams.get('error');
    if (error)
      throw new AppError(
        'mcp.signin_denied',
        error === 'access_denied'
          ? '登录被拒绝'
          : '服务没有完成登录：' + (callback.searchParams.get('error_description') || error).slice(0, 200),
      );
    if (!provider.checkState(callback.searchParams.get('state')))
      throw new AppError('mcp.signin_state', '登录回调与本次登录不匹配，请重新登录');
    const code = callback.searchParams.get('code');
    if (!code) throw new AppError('mcp.signin_denied', '服务没有返回授权码');
    await auth(provider, { serverUrl: options.serverUrl, scope: options.scope, authorizationCode: code });
  } finally {
    loopback.close();
  }
}
