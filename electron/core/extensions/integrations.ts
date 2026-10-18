import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AppConnectorInput, IntegrationsView, ScreenReference } from '../../../shared/types/core';
import { APP_CONNECTORS, appConnectorFor, sameServerUrl } from '../../../shared/app-connectors';
import { AppError } from '../../../shared/errors';
import { McpAuthStore, signIn, type SecretCodec } from './mcp-auth';
import { atomicJson, Store } from '../storage/store';
import { canonical, hashId, type IntegrationPaths } from './integration-paths';
import { SkillLibrary } from './skill-library';
import { discoverMcp, parseMcpSnippet } from './mcp-config';
import { McpRuntime, type McpPreference } from './mcp-runtime';
import type { VmController } from '../vm/vm';

interface Preferences {
  version: 1;
  extraSkillDirs: string[];
  extraMcpFiles: string[];
  servers: Record<string, McpPreference>;
}
export class Integrations {
  readonly skills: SkillLibrary;
  readonly mcp: McpRuntime;
  readonly preferencesFile: string;
  private preferences: Preferences;
  private mcpSources: IntegrationsView['sources'] = [];
  private scannedAt = '';
  /** Sign-in for remote servers; only where secrets can be encrypted (not in the headless CLI). */
  private auth?: McpAuthStore;
  private signIns = new Map<string, AbortController>();
  constructor(
    private store: Store,
    readonly paths: IntegrationPaths,
    private changed: () => void,
    imageSink?: (data: string, mime: string) => ScreenReference,
    codec?: SecretCodec,
  ) {
    mkdirSync(paths.configDir, { recursive: true });
    mkdirSync(join(paths.homeDir, '.agents', 'skills'), { recursive: true });
    const mcpFile = join(paths.configDir, 'mcp.json');
    if (!existsSync(mcpFile)) atomicJson(mcpFile, { mcpServers: {} });
    this.preferencesFile = join(paths.configDir, 'integrations.json');
    let saved: Partial<Preferences> = {};
    try {
      if (existsSync(this.preferencesFile))
        saved = JSON.parse(readFileSync(this.preferencesFile, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      /* An invalid preference cache does not prevent discovery. */
    }
    this.preferences = {
      version: 1,
      extraSkillDirs: Array.isArray(saved.extraSkillDirs)
        ? saved.extraSkillDirs.filter((value) => typeof value === 'string')
        : [],
      extraMcpFiles: Array.isArray(saved.extraMcpFiles)
        ? saved.extraMcpFiles.filter((value) => typeof value === 'string')
        : [],
      servers: saved.servers && typeof saved.servers === 'object' ? saved.servers : {},
    };
    paths.extraSkillDirs = this.preferences.extraSkillDirs;
    paths.extraMcpFiles = this.preferences.extraMcpFiles;
    this.skills = new SkillLibrary(store, paths);
    if (codec) this.auth = new McpAuthStore(join(paths.dataDir, 'mcp-auth.json'), codec);
    const auth = this.auth;
    this.mcp = new McpRuntime(
      this.preferences.servers,
      changed,
      imageSink,
      auth && {
        store: auth,
        ownClient: (url) => (appConnectorFor(url)?.auth === 'google' ? auth.ownClient('google') : undefined),
      },
    );
  }
  async refresh() {
    this.skills.refresh();
    const discovered = discoverMcp(this.paths);
    this.mcpSources = discovered.sources;
    await this.mcp.replace(discovered.configs);
    this.scannedAt = new Date().toISOString();
    this.changed();
  }
  snapshot(): IntegrationsView {
    return {
      sharedSkillDir: join(this.paths.homeDir, '.agents', 'skills'),
      privateSkillDir: join(this.paths.dataDir, 'bots'),
      mcpFile: join(this.paths.configDir, 'mcp.json'),
      projectDir: this.paths.projectDir,
      sources: [...this.skills.sources, ...this.mcpSources],
      servers: this.mcp.views(),
      scannedAt: this.scannedAt,
      ownClients: this.auth?.ownClient('google') ? ['google'] : [],
    };
  }
  private get mcpFile() {
    return join(this.paths.configDir, 'mcp.json');
  }
  private readMcpFile() {
    let current: any = { mcpServers: {} };
    try {
      if (existsSync(this.mcpFile)) current = JSON.parse(readFileSync(this.mcpFile, 'utf8').replace(/^\uFEFF/, ''));
    } catch {}
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = { mcpServers: {} };
    if (!current.mcpServers || typeof current.mcpServers !== 'object' || Array.isArray(current.mcpServers))
      current.mcpServers = {};
    return current as { mcpServers: Record<string, any> };
  }
  private requireAuth() {
    if (!this.auth) throw new AppError('mcp.signin_unavailable', '这里不能登录 MCP 服务');
    return this.auth;
  }
  /** Adds an app from the catalog to the app's own MCP config, with its token or Google client. */
  async addApp(input: AppConnectorInput) {
    const app = APP_CONNECTORS.find((item) => item.id === input?.app);
    if (!app) throw new AppError('mcp.app_unknown', '未知的应用');
    const token = typeof input.token === 'string' ? input.token.trim() : '';
    if (app.auth === 'token' && (!token || token.length > 4000 || /\s/.test(token)))
      throw new AppError('mcp.token_invalid', '请粘贴有效的访问令牌');
    if (app.auth === 'google') {
      const clientId = typeof input.clientId === 'string' ? input.clientId.trim() : '',
        clientSecret = typeof input.clientSecret === 'string' ? input.clientSecret.trim() : '';
      if (clientId || clientSecret) {
        if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret || clientSecret.length > 200)
          throw new AppError('mcp.google_client_invalid', '请填写 Google OAuth 客户端的 ID 和密钥');
        this.requireAuth().setOwnClient('google', { client_id: clientId, client_secret: clientSecret });
      } else if (!this.requireAuth().ownClient('google'))
        throw new AppError('mcp.google_client_invalid', '请填写 Google OAuth 客户端的 ID 和密钥');
    }
    if (app.auth === 'token') this.requireAuth().update(app.url, (record) => (record.token = token));
    const current = this.readMcpFile();
    let name = Object.entries(current.mcpServers).find(
      ([, raw]) => typeof raw?.url === 'string' && sameServerUrl(raw.url, app.url),
    )?.[0];
    if (!name) {
      name = app.name;
      for (let n = 2; current.mcpServers[name]; n++) name = `${app.name} ${n}`;
      current.mcpServers[name] = { type: 'http', url: app.url };
      atomicJson(this.mcpFile, current);
    }
    await this.refresh();
    const server = this.mcp.views().find((item) => item.name === name && item.source.label === 'Aelion');
    if (!server) throw new AppError('mcp.app_unknown', '没能添加这个应用');
    if (!server.enabled) await this.setEnabled(server.id, true);
    return server.id;
  }
  /** Opens the service's sign-in page and waits for the person to finish. */
  async signIn(id: string, open: (url: URL) => void | Promise<void>) {
    const auth = this.requireAuth(),
      config = this.mcp.config(id),
      view = this.mcp.views().find((item) => item.id === config.id);
    if (!view?.login || !config.url) throw new AppError('mcp.signin_unavailable', '这个服务不需要登录');
    if (this.signIns.has(config.id)) throw new AppError('mcp.signin_running', '登录页已经打开，请在浏览器里完成登录');
    const app = appConnectorFor(config.url),
      ownClient = app?.auth === 'google' ? auth.ownClient('google') : undefined;
    if (app?.auth === 'google' && !ownClient)
      throw new AppError('mcp.google_client_invalid', '请先填写 Google OAuth 客户端的 ID 和密钥');
    const controller = new AbortController();
    this.signIns.set(config.id, controller);
    this.mcp.signingIn.add(config.id);
    this.changed();
    try {
      await signIn(auth, {
        serverUrl: config.url,
        scope: app?.scope,
        clientMetadataUrl: app?.clientMetadataUrl,
        ownClient,
        // Google issues a refresh token only when asked for offline access.
        authorizationParams: app?.auth === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined,
        open,
        signal: controller.signal,
      });
      await this.mcp.disconnect(config.id);
      if (!view.enabled) await this.setEnabled(config.id, true);
      else void this.mcp.warm([config.id]);
    } finally {
      this.signIns.delete(config.id);
      this.mcp.signingIn.delete(config.id);
      this.changed();
    }
  }
  cancelSignIn(id: string) {
    this.signIns.get(this.mcp.config(id).id)?.abort();
  }
  async signOut(id: string) {
    const config = this.mcp.config(id);
    if (config.url) this.requireAuth().delete(config.url);
    await this.mcp.disconnect(config.id);
    this.changed();
  }
  /** Removes a server from the app's own MCP config; servers from other apps' configs stay where they are. */
  async remove(id: string) {
    const config = this.mcp.config(id);
    if (!config.native) throw new AppError('mcp.remove_external', '这个服务来自其他应用的配置，请在那里移除');
    const current = this.readMcpFile();
    delete current.mcpServers[config.name];
    atomicJson(this.mcpFile, current);
    if (config.url && this.auth) this.auth.delete(config.url);
    await this.refresh();
  }
  private save() {
    atomicJson(this.preferencesFile, this.preferences);
  }
  async add(kind: 'skills' | 'mcp', path: string) {
    path = resolve(path);
    if ((kind === 'skills' && !statSync(path).isDirectory()) || (kind === 'mcp' && !statSync(path).isFile()))
      throw new Error('请选择有效目录或配置文件');
    const list = kind === 'skills' ? this.preferences.extraSkillDirs : this.preferences.extraMcpFiles;
    if (!list.some((value) => canonical(value) === canonical(path))) list.push(path);
    this.save();
    await this.refresh();
  }
  async importMcpSnippet(text: string) {
    const servers = parseMcpSnippet(text),
      file = join(this.paths.configDir, 'mcp.json');
    let current: any = { mcpServers: {} };
    try {
      if (existsSync(file)) current = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch {}
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = { mcpServers: {} };
    const existing =
      current.mcpServers && typeof current.mcpServers === 'object' && !Array.isArray(current.mcpServers)
        ? current.mcpServers
        : {};
    current.mcpServers = { ...existing, ...servers };
    atomicJson(file, current);
    await this.refresh();
    return Object.keys(servers);
  }
  path(input: { kind: string; id?: string }) {
    const view = this.snapshot();
    if (input.kind === 'shared-skills') return view.sharedSkillDir;
    if (input.kind === 'private-skills') {
      mkdirSync(view.privateSkillDir, { recursive: true });
      return view.privateSkillDir;
    }
    if (input.kind === 'mcp-config') return view.mcpFile;
    const source = view.sources.find((source) => source.id === input.id);
    if (source) return source.path;
    const skill = this.skills.all().find((skill) => skill.id === input.id);
    if (skill?.source) return skill.source.path;
    const server = view.servers.find((server) => server.id === input.id);
    if (server) return server.source.path;
    throw new Error('来源路径不存在');
  }
  async setEnabled(id: string, enabled: boolean) {
    await this.mcp.setEnabled(id, enabled);
    this.save();
    // Connected now, so its tools are offered from the next run on.
    if (enabled) void this.mcp.warm([this.mcp.config(id).id]);
  }
  async materialize(vm: VmController, botId: string, id: string) {
    const bundle = this.skills.bundle(botId, id);
    const digest = hashId(
      bundle.files.map((file) => `${file.path}:${hashId(file.bytes.toString('base64'))}`).join('\n'),
    );
    const vmPath = await vm.installSkillPackage(botId, `${bundle.id}-${digest}`, bundle.folder, bundle.files);
    return {
      id,
      name: this.skills.read(botId, id).name,
      vmPath,
      files: bundle.files.map((file) => file.path),
      note: '这是技能的工作电脑副本；原 Agent 目录保持只读。请在此目录执行相对脚本，依赖需在工作电脑中可用。',
    };
  }
  async close() {
    await this.mcp.dispose();
  }
}
