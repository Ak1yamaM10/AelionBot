// Apps a Bot can work in through their official remote MCP servers. Each entry was checked against the live
// server: OAuth entries accept dynamic client registration, so signing in needs nothing but the browser.
// Token entries take a token the person creates; Google needs an OAuth client in the person's own Cloud project.

/**
 * - `oauth`: sign in in the browser; the app registers itself with the service.
 * - `token`: the person pastes an access token.
 * - `google`: sign in with an OAuth client the person creates in Google Cloud.
 * - `none`: no account needed.
 */
type AppConnectorAuth = 'oauth' | 'token' | 'google' | 'none';
export type AppConnectorGroup = 'google' | 'work' | 'dev' | 'design' | 'commerce';

export interface AppConnector {
  id: string;
  name: string;
  /** Simplified Chinese, used as the i18n key. */
  description: string;
  group: AppConnectorGroup;
  url: string;
  auth: AppConnectorAuth;
  /** Requested instead of everything the server lists, where that would ask for more than the tools need. */
  scope?: string;
  /** Where the person creates a token, for `token` entries. */
  tokenUrl?: string;
  /** Runs on this computer, inside another app. */
  local?: boolean;
}

export const APP_CONNECTOR_GROUPS: Array<{ id: AppConnectorGroup; name: string }> = [
  { id: 'work', name: '文档与协作' },
  { id: 'google', name: 'Google' },
  { id: 'dev', name: '开发与数据' },
  { id: 'design', name: '设计' },
  { id: 'commerce', name: '支付与商务' },
];

/** The redirect the app listens on while someone signs in. Google clients must list it exactly. */
export const OAUTH_REDIRECT_PORT = 47391;
export const OAUTH_REDIRECT_URL = `http://127.0.0.1:${OAUTH_REDIRECT_PORT}/callback`;

const google = (id: string, name: string, description: string, host: string, scopes: string[]): AppConnector => ({
  id,
  name,
  description,
  group: 'google',
  url: `https://${host}.googleapis.com/mcp/v1`,
  auth: 'google',
  scope: scopes.map((scope) => 'https://www.googleapis.com/auth/' + scope).join(' '),
});
const DRIVE = ['drive.readonly', 'drive.file'];

export const APP_CONNECTORS: AppConnector[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: '搜索和编辑 Notion 页面与数据库',
    group: 'work',
    url: 'https://mcp.notion.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: '查看和更新 Linear 的 issue 与项目',
    group: 'work',
    url: 'https://mcp.linear.app/mcp',
    auth: 'oauth',
  },
  {
    id: 'atlassian',
    name: 'Jira 与 Confluence',
    description: '读写 Jira issue 和 Confluence 页面',
    group: 'work',
    url: 'https://mcp.atlassian.com/v1/mcp',
    auth: 'oauth',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: '读写 Airtable 的表格和记录',
    group: 'work',
    url: 'https://mcp.airtable.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'monday',
    name: 'monday.com',
    description: '管理 monday.com 的看板和任务',
    group: 'work',
    url: 'https://mcp.monday.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    description: '查看 Intercom 的对话和客户',
    group: 'work',
    url: 'https://mcp.intercom.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: '通过 Zapier 使用上千个应用的操作',
    group: 'work',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    auth: 'oauth',
  },
  google('gmail', 'Gmail', '搜索和阅读邮件，起草回复', 'gmailmcp', ['gmail.readonly', 'gmail.compose']),
  google('google-drive', 'Google Drive', '查找、读取和上传 Drive 文件', 'drivemcp', DRIVE),
  google('google-calendar', 'Google 日历', '查看日程和空闲时间', 'calendarmcp', [
    'calendar.calendarlist.readonly',
    'calendar.events.freebusy',
    'calendar.events.readonly',
  ]),
  google('google-docs', 'Google 文档', '读取和编辑 Google 文档', 'docsmcp', [
    ...DRIVE,
    'documents.readonly',
    'documents',
  ]),
  google('google-sheets', 'Google 表格', '读取和编辑 Google 表格', 'sheetsmcp', [
    ...DRIVE,
    'spreadsheets.readonly',
    'spreadsheets',
  ]),
  google('google-slides', 'Google 幻灯片', '读取和编辑 Google 幻灯片', 'slidesmcp', [
    ...DRIVE,
    'presentations.readonly',
    'presentations',
  ]),
  {
    id: 'github',
    name: 'GitHub',
    description: '查看和管理仓库、issue 与 pull request',
    group: 'dev',
    url: 'https://api.githubcopilot.com/mcp/',
    auth: 'token',
    tokenUrl: 'https://github.com/settings/personal-access-tokens/new',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: '管理 Supabase 项目、数据库和 Edge Functions',
    group: 'dev',
    url: 'https://mcp.supabase.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: '管理 Neon 的 Postgres 数据库',
    group: 'dev',
    url: 'https://mcp.neon.tech/mcp',
    auth: 'oauth',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: '查看 Vercel 项目、部署和日志',
    group: 'dev',
    url: 'https://mcp.vercel.com',
    auth: 'oauth',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: '管理 Cloudflare Workers、KV、R2 和 D1',
    group: 'dev',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: '查看 Sentry 的错误、事件和问题',
    group: 'dev',
    url: 'https://mcp.sentry.dev/mcp',
    auth: 'oauth',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: '搜索 Hugging Face 的模型、数据集和 Spaces',
    group: 'dev',
    url: 'https://huggingface.co/mcp',
    auth: 'none',
  },
  {
    id: 'canva',
    name: 'Canva',
    description: '搜索、创建和编辑 Canva 设计',
    group: 'design',
    url: 'https://mcp.canva.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'miro',
    name: 'Miro',
    description: '读取和编辑 Miro 白板',
    group: 'design',
    url: 'https://mcp.miro.com/',
    auth: 'oauth',
  },
  {
    id: 'webflow',
    name: 'Webflow',
    description: '管理 Webflow 网站和 CMS 内容',
    group: 'design',
    url: 'https://mcp.webflow.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'figma-desktop',
    name: 'Figma 桌面版',
    description: '读取 Figma 桌面版里打开的设计',
    group: 'design',
    url: 'http://127.0.0.1:3845/mcp',
    auth: 'none',
    local: true,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: '查询 Stripe 的客户、付款和订阅',
    group: 'commerce',
    url: 'https://mcp.stripe.com',
    auth: 'oauth',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    description: '查询 PayPal 的交易、发票和订单',
    group: 'commerce',
    url: 'https://mcp.paypal.com/mcp',
    auth: 'oauth',
  },
  {
    id: 'square',
    name: 'Square',
    description: '查询 Square 的商品、订单和付款',
    group: 'commerce',
    url: 'https://mcp.squareup.com/mcp',
    auth: 'oauth',
  },
];

/** The same address however it was written: case of the host and a trailing slash do not matter. */
export function sameServerUrl(a: string, b: string) {
  const normal = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
    } catch {
      return value;
    }
  };
  return normal(a) === normal(b);
}
export const appConnectorFor = (url?: string) =>
  url ? APP_CONNECTORS.find((item) => sameServerUrl(item.url, url)) : undefined;
