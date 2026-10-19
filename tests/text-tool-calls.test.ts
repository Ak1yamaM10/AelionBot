import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverTextToolCalls } from '../electron/core/model/text-tool-calls';
import type { ToolDefinition } from '../electron/core/model/model';

const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'group_read',
      description: '',
      parameters: { type: 'object', properties: { groupId: { type: 'string' }, limit: { type: 'number' } } },
    },
  },
];
const reply = (content: string, extra = {}) => ({ content, calls: [], finishReason: 'stop', ...extra });

test('a tool call written as text in the Qwen/GLM markup becomes a real call and leaves the reply', () => {
  const result = recoverTextToolCalls(
    reply(
      '<tool_call><function=group_read><parameter=groupId>72b6ce78</parameter><parameter=limit>20</parameter></function>',
    ),
    tools,
  );
  assert.equal(result.content, '', 'nothing of the markup is published');
  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.calls[0].function.name, 'group_read');
  assert.deepEqual(JSON.parse(result.calls[0].function.arguments), { groupId: '72b6ce78', limit: 20 });
});

test('the Hermes JSON form is recovered too, and prose around it stays', () => {
  const result = recoverTextToolCalls(
    reply('我先看看记录。\n<tool_call>\n{"name": "group_read", "arguments": {"groupId": "g1"}}\n</tool_call>'),
    tools,
  );
  assert.equal(result.content, '我先看看记录。');
  assert.deepEqual(JSON.parse(result.calls[0].function.arguments), { groupId: 'g1' });
});

test('markup for a tool that was not offered, or beside native calls, is removed but never run', () => {
  const unknown = recoverTextToolCalls(
    reply('好的<tool_call><function=rm_rf><parameter=path>/</parameter></function></tool_call>'),
    tools,
  );
  assert.deepEqual([unknown.content, unknown.calls.length, unknown.finishReason], ['好的', 0, 'stop']);
  const native = { id: 'n1', type: 'function' as const, function: { name: 'group_read', arguments: '{}' } };
  const both = recoverTextToolCalls(
    reply('<tool_call>{"name": "group_read", "arguments": {}}</tool_call>', {
      calls: [native],
      finishReason: 'tool_calls',
    }),
    tools,
  );
  assert.deepEqual(both.calls, [native], 'a native call is not doubled');
  assert.equal(both.content, '');
  const plain = reply('普通的回复');
  assert.equal(recoverTextToolCalls(plain, tools), plain);
});
