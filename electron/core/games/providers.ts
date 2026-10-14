import { GameModelError, parseGameAction } from './model-player';
import { gameMode } from './modes';
import { contextBudget, textTokens } from '../context/context-budget';
import { DEFAULT_RUNTIME } from '../../../shared/types/runtime-types';
import type { DecisionOptions } from './runtime';
import type { GamePlayer, GameView, GameRequest } from '../../../shared/types/game-types';

export interface GameProviderConfig {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  backend?: 'responses' | 'chat-completions';
  contextTokens?: number;
  reasoningEffort?: string;
  maxOutputTokens?: number;
}
function outputLimit(model: GameProviderConfig, prompt: string) {
  const ceiling = model.maxOutputTokens ?? DEFAULT_RUNTIME.maxOutputTokens;
  const capacity = model.contextTokens || 32768;
  const available = Math.floor(capacity - textTokens(prompt) - contextBudget(capacity).safety);
  // Below ~1k tokens even a short reply plus a little reasoning is cut off, which only fails the action again.
  return Math.max(Math.min(1024, ceiling), Math.min(ceiling, available));
}
/** The provider's own explanation from an error body: error.message from JSON, else the text itself. */
function providerMessage(body: string) {
  let text = body;
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
    if (typeof message === 'string') text = message;
  } catch {
    // Not JSON: a gateway page or plain text.
  }
  return (
    text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      // Any long token-like run could be a key echoed back by the provider or a proxy.
      .replace(/[A-Za-z0-9_-]{24,}/g, '***')
      .trim()
      .slice(0, 300)
  );
}
/** Retry-After in seconds or as an HTTP date. */
function retryAfterMs(header: string | null) {
  if (!header) return undefined;
  const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}
export function gameProviders(
  config: Omit<GameProviderConfig, 'id' | 'name'> & { additionalProviders?: GameProviderConfig[] },
) {
  const providers: GameProviderConfig[] = [
    { ...config, id: 'grok-game', name: 'Grok', backend: 'responses' },
    ...(config.additionalProviders || []),
  ];
  const selection = (p: GameProviderConfig) => ({
    providerId: p.id,
    model: p.model,
    contextTokens: p.contextTokens || 32768,
  });
  function resolve(player: GamePlayer) {
    const p = player.model
      ? providers.find((p) => p.id === player.model!.providerId && p.model === player.model!.model)
      : providers[0];
    if (!p) throw new Error('所选游戏模型未配置，请重新选择');
    return p;
  }
  return {
    publicConfig: {
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        models: [{ id: p.model, contextTokens: p.contextTokens || 32768 }],
      })),
      selection: selection(providers[0]),
    },
    normalize: (player: GamePlayer): GamePlayer => ({
      ...player,
      model: player.human ? undefined : selection(resolve(player)),
    }),
    check: (players: GamePlayer[]) => {
      for (const p of players) if (!p.human) resolve(p);
    },
    async decide(
      player: GamePlayer,
      context: GameView,
      request: GameRequest,
      signal: AbortSignal,
      options?: DecisionOptions,
    ) {
      const p = resolve(player),
        chat = p.backend === 'chat-completions';
      const date = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
      }).format(new Date());
      const instructions =
          gameMode(context.mode).instructions(context, request) +
          (options?.retryFeedback ? '\n上次校验失败：' + options.retryFeedback + '。请纠正本次 JSON 字段。' : ''),
        input = gameMode(context.mode).prompt(context, request);
      const identity = p.model.startsWith('mimo-')
        ? `你是MiMo（中文名称也是MiMo），是小米公司研发的AI智能助手。今天的日期：${date}，你的知识截止日期是2024年12月。以下游戏中请扮演指定玩家，发言不需要介绍模型身份。\n\n`
        : '';
      const output = outputLimit(p, identity + instructions + input);
      const body = chat
        ? {
            model: p.model,
            messages: [
              { role: 'system', content: identity + instructions },
              { role: 'user', content: input },
            ],
            max_completion_tokens: output,
            stream: false,
            ...(p.model.startsWith('mimo-') ? { response_format: { type: 'json_object' } } : {}),
            ...(p.model === 'mimo-v2.6-flash' ? { thinking: { type: 'disabled' } } : {}),
          }
        : {
            model: p.model,
            instructions,
            input,
            reasoning: { effort: p.reasoningEffort || 'low' },
            max_output_tokens: output,
            store: false,
          };
      options?.onRequest?.({
        input,
        instruction: chat ? identity + instructions : instructions,
        config: {
          model: p.model,
          protocol: chat ? 'chat-completions' : 'responses',
          ...(chat ? {} : { reasoningEffort: p.reasoningEffort || 'low' }),
          contextTokens: p.contextTokens || 32768,
          maxOutputTokens: output,
        },
      });
      const start = Date.now();
      let response: Response;
      try {
        response = await fetch(p.baseUrl.replace(/\/$/, '') + (chat ? '/chat/completions' : '/responses'), {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + p.apiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
          body: JSON.stringify(body),
        });
      } catch (error) {
        // Keep cancellation/timeout semantics; never expose raw transport errors or URLs with credentials.
        if (signal.aborted || (error as Error)?.name === 'TimeoutError') throw error;
        const code = (error as { cause?: { code?: string } })?.cause?.code;
        const failure =
          code === 'ENOTFOUND' || code === 'EAI_AGAIN'
            ? ['dns_failed', '模型服务域名解析失败，请检查网络、DNS 或模型服务地址']
            : code === 'ECONNREFUSED'
              ? ['connection_refused', '模型服务拒绝连接，请检查服务是否可用']
              : code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT'
                ? ['connection_timeout', '连接模型服务超时，请检查网络或稍后重试']
                : code === 'CERT_HAS_EXPIRED' ||
                    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                    code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
                  ? ['tls_failed', '模型服务证书校验失败，请检查服务证书']
                  : ['network_failed', '无法连接模型服务，请检查网络或稍后重试'];
        throw new GameModelError('network', failure[1], 'game.' + failure[0]);
      }
      if (!response.ok) {
        const status = response.status,
          detail = providerMessage(await response.text().catch(() => ''));
        const summary = status === 429 ? ' 请求过于频繁' : status >= 500 ? ' 暂时不可用' : ' 请求失败';
        throw new GameModelError(
          'http',
          `${p.name}${summary}（HTTP ${status}${detail ? '：' + detail : ''}）`,
          'game.http_' + status,
          undefined,
          retryAfterMs(response.headers.get('retry-after')),
        );
      }
      const headersMs = Date.now() - start;
      let result: any;
      try {
        result = await response.json();
      } catch (error) {
        if (signal.aborted || (error as Error)?.name === 'TimeoutError') throw error;
        throw new GameModelError(
          'network',
          p.name + ' 返回的不是有效 JSON 响应，可能是网关或代理错误',
          'game.bad_response',
        );
      }
      options?.onResponse({
        httpStatus: response.status,
        headersMs,
        totalMs: Date.now() - start,
        finishReason: result.choices?.[0]?.finish_reason || result.status,
        inputTokens: result.usage?.prompt_tokens ?? result.usage?.input_tokens,
        outputTokens: result.usage?.completion_tokens ?? result.usage?.output_tokens,
        reasoningTokens:
          result.usage?.completion_tokens_details?.reasoning_tokens ??
          result.usage?.output_tokens_details?.reasoning_tokens,
      });
      const text = chat
        ? result.choices?.[0]?.message?.content
        : result.output_text ||
          result.output
            ?.flatMap((o: any) => o.content || [])
            .filter((c: any) => c.type === 'output_text')
            .map((c: any) => c.text)
            .join('');
      const reasoningTokens =
        result.usage?.completion_tokens_details?.reasoning_tokens ??
        result.usage?.output_tokens_details?.reasoning_tokens;
      if (
        chat
          ? result.choices?.[0]?.finish_reason === 'length'
          : result.status === 'incomplete' && result.incomplete_details?.reason === 'max_output_tokens'
      )
        throw new GameModelError(
          'format',
          p.name + ' 输出被截断：达到生成上限（推理 token ' + (reasoningTokens ?? '未知') + '）',
          'game.output_truncated',
        );
      if (typeof text !== 'string' || !text.trim()) throw new GameModelError('empty', p.name + ' 没有返回行动');
      return parseGameAction(text, request.kind, request, context.seats);
    },
  };
}
