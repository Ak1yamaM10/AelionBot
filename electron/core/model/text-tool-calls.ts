import { randomUUID } from 'node:crypto';
import type { ToolCall } from '../../../shared/types/core';
import type { Completion, ToolDefinition } from './model';

/**
 * Some open models served through compatible endpoints write a tool call into the reply text instead of the
 * tool_calls field, in their chat template's own markup:
 *
 *   <tool_call><function=group_read><parameter=groupId>…</parameter></function></tool_call>   (Qwen3-Coder, GLM)
 *   <tool_call>{"name": "group_read", "arguments": {"groupId": "…"}}</tool_call>               (Hermes, Qwen2.5)
 *
 * Left as text, the markup was published to the group as the Bot's message. Calls to tools that were offered
 * become real calls, so the turn goes on as the model meant; any such markup left over is removed from the text.
 * The closing </tool_call> is often missing, so a block runs to the next one or to the end of the reply.
 */
const BLOCK = /<tool_call>([\s\S]*?)(?:<\/tool_call>|(?=<tool_call>)|$)/g;
const XML_FUNCTION = /<function=([\w.-]+)>([\s\S]*?)(?:<\/function>|$)/;
const XML_PARAMETER = /<parameter=([\w.-]+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|$)/g;

function parseBlock(body: string, tools: Map<string, ToolDefinition>) {
  const xml = XML_FUNCTION.exec(body);
  if (xml) {
    const tool = tools.get(xml[1]);
    if (!tool) return undefined;
    const properties = (tool.function.parameters.properties || {}) as Record<string, { type?: string }>;
    const args: Record<string, unknown> = {};
    for (const [, key, raw] of xml[2].matchAll(XML_PARAMETER)) {
      const value = raw.trim();
      if (properties[key]?.type === 'string') args[key] = value;
      else
        try {
          args[key] = JSON.parse(value);
        } catch {
          args[key] = value;
        }
    }
    return { name: xml[1], args };
  }
  const text = body.trim();
  if (!text.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(text) as { name?: unknown; arguments?: unknown; parameters?: unknown };
    if (typeof parsed.name !== 'string' || !tools.has(parsed.name)) return undefined;
    const args = parsed.arguments ?? parsed.parameters ?? {};
    return { name: parsed.name, args: typeof args === 'string' ? JSON.parse(args) : args };
  } catch {
    return undefined;
  }
}

export function recoverTextToolCalls(result: Completion, tools: ToolDefinition[]): Completion {
  if (!result.content.includes('<tool_call>')) return result;
  const offered = new Map(tools.map((tool) => [tool.function.name, tool]));
  const calls: ToolCall[] = [];
  const content = result.content.replace(BLOCK, (_, body: string) => {
    // Converted only when the provider returned no native calls and no native replay, so nothing is doubled.
    const parsed = !result.calls.length && !result.native ? parseBlock(body, offered) : undefined;
    if (parsed)
      calls.push({
        id: 'text_' + randomUUID(),
        type: 'function',
        function: { name: parsed.name, arguments: JSON.stringify(parsed.args) },
      });
    return '';
  });
  return {
    ...result,
    content: content.trim(),
    ...(calls.length ? { calls, finishReason: 'tool_calls' } : {}),
  };
}
