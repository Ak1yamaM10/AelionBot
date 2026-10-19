// DeepSeek's web search and fetch APIs (https://api-docs.deepseek.com/zh-cn/guides/search) served as an MCP server
// inside the app. DeepSeek has no MCP endpoint of its own; this lets it join the app catalog like the remote ones,
// with the same switch, encrypted API key and native functions.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const API = 'https://api.deepseek.com/v1/tools';
const PAGE_CHARS = 12000;
const MAX_PAGE_CHARS = 32000;
/** Body text per result when `need_content` is set, so 50 results stay within one tool result. */
const RESULT_CONTENT_CHARS = 4000;

const TOOLS: Tool[] = [
  {
    name: 'search',
    description:
      '用 DeepSeek 搜索网页，返回标题、链接、日期、来源和摘要。query 支持 site:、-site:、"精确短语"、-排除词、lang:zh,en、after:2025-01-01、before:2025。rerank_score ≥ 1.5 的结果相关度高，authority ≥ 3 的来源权威度高。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 128, description: '搜索词，1–128 个字符' },
        count: { type: 'integer', minimum: 1, maximum: 50, description: '返回结果数，默认 10' },
        ori_question: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: '用户的原始问题，帮助判断搜索意图',
        },
        need_content: {
          type: 'boolean',
          description: `为 true 时附带每个结果的网页正文（每条最多 ${RESULT_CONTENT_CHARS} 字）`,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { title: 'DeepSeek 网页搜索', readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'fetch',
    description:
      '用 DeepSeek 抓取网页，返回标题和 Markdown 正文。正文较长时分页返回，用 offset 读取后续内容；同一网址 30 分钟内翻页不会重复抓取。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 8192, description: 'http 或 https 网址' },
        offset: { type: 'integer', minimum: 0, description: '从正文第几个字符开始，默认 0' },
        max_chars: {
          type: 'integer',
          minimum: 100,
          maximum: MAX_PAGE_CHARS,
          description: `本次最多返回的字符数，默认 ${PAGE_CHARS}`,
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: { title: 'DeepSeek 网页抓取', readOnlyHint: true, openWorldHint: true },
  },
];

interface SearchResult {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string;
  date?: string | null;
  authority?: number;
}

const STATUS: Record<number, string> = {
  400: '请求参数无效',
  401: 'DeepSeek API Key 无效，请在插件页移除 DeepSeek 后用新的 Key 重新添加',
  402: 'DeepSeek 账户余额不足，充值后再试',
  403: '这个网址被 DeepSeek 的安全策略拦截',
  404: 'DeepSeek 没能从这个网址取到可用内容',
  408: '请求超时，稍后重试',
  413: '请求内容过大',
  429: '请求过于频繁，稍后重试',
  504: '目标网站响应超时，稍后重试',
};

const failure = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** One page of text, with where the next page starts. */
function page(text: string, offset: number, maxChars: number) {
  const part = text.slice(offset, offset + maxChars),
    end = offset + part.length;
  return end < text.length
    ? `${part}\n\n[正文共 ${text.length} 字，已显示到第 ${end} 字；用 offset=${end} 继续读取]`
    : part;
}

function formatResults(results: SearchResult[], withContent: boolean) {
  if (!results.length) return '没有搜索结果。';
  return results
    .map((item, index) => {
      const meta = [
        item.site_name,
        item.date?.slice(0, 10),
        typeof item.rerank_score === 'number' ? `相关度 ${item.rerank_score.toFixed(2)}` : '',
        typeof item.authority === 'number' && item.authority >= 0 ? `权威度 ${item.authority}` : '',
      ].filter(Boolean);
      const lines = [`${index + 1}. ${item.title || item.url}`, item.url || ''];
      if (meta.length) lines.push(meta.join(' · '));
      const summary = item.summary || item.snippet;
      if (summary) lines.push(summary.trim());
      if (withContent && item.content) {
        const content = item.content.trim();
        lines.push(
          '正文：\n' +
            (content.length > RESULT_CONTENT_CHARS
              ? content.slice(0, RESULT_CONTENT_CHARS) + '\n[正文已截断，可用 fetch 读取全文]'
              : content),
        );
      }
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');
}

/** Calls the API with the person's key; errors come back as tool results the model can read. */
async function post(
  apiKey: string,
  path: 'search' | 'fetch',
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ data: Record<string, unknown> } | { data?: undefined; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { error: '连接 DeepSeek 失败，请检查网络或代理' };
  }
  const data = await response.json().catch(() => undefined);
  if (response.ok && data && typeof data === 'object') return { data: data as Record<string, unknown> };
  const message = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 300) : '';
  const known = STATUS[response.status] || (response.status >= 500 ? 'DeepSeek 服务暂时出错，稍后重试' : '');
  return { error: `${known || `DeepSeek 返回 HTTP ${response.status}`}${message ? `（${message}）` : ''}` };
}

function deepseekServer(apiKey: string) {
  const server = new Server({ name: 'deepseek', version: '1.0.0' }, { capabilities: { tools: {} } });
  const pages = new Map<string, { title: string; content: string; time: number }>();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra): Promise<CallToolResult> => {
    const args = (params.arguments || {}) as Record<string, any>;
    if (params.name === 'search') {
      const result = await post(
        apiKey,
        'search',
        {
          query: args.query,
          count: args.count ?? 10,
          need_content: args.need_content === true,
          ...(args.ori_question ? { ori_question: args.ori_question } : {}),
        },
        extra.signal,
      );
      if (!result.data) return failure(result.error);
      const results = Array.isArray(result.data.results) ? (result.data.results as SearchResult[]) : [];
      return { content: [{ type: 'text', text: formatResults(results, args.need_content === true) }] };
    }
    if (params.name === 'fetch') {
      const url = String(args.url);
      if (!/^https?:\/\//i.test(url)) return failure('只能抓取 http 或 https 网址');
      let cached = pages.get(url);
      if (!cached || Date.now() - cached.time > 30 * 60000) {
        const result = await post(apiKey, 'fetch', { url }, extra.signal);
        if (!result.data) return failure(result.error);
        cached = {
          title: typeof result.data.title === 'string' ? result.data.title : '',
          content: typeof result.data.content === 'string' ? result.data.content : '',
          time: Date.now(),
        };
        pages.delete(url);
        pages.set(url, cached);
        while (pages.size > 16) pages.delete(pages.keys().next().value!);
      }
      const offset = Number.isInteger(args.offset) ? args.offset : 0,
        maxChars = Number.isInteger(args.max_chars) ? args.max_chars : PAGE_CHARS;
      if (offset > 0 && offset >= cached.content.length) return failure(`offset 超出正文长度 ${cached.content.length}`);
      const body = cached.content ? page(cached.content, offset, maxChars) : '（页面没有正文）';
      return { content: [{ type: 'text', text: `# ${cached.title || url}\n${url}\n\n${body}` }] };
    }
    return failure('未知工具');
  });
  return server;
}

/** The client side of a fresh in-process DeepSeek server; closing it closes the server. */
export async function deepseekTransport(apiKey: string) {
  const [client, server] = InMemoryTransport.createLinkedPair();
  await deepseekServer(apiKey).connect(server);
  return client;
}
