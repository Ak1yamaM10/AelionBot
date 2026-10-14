import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmptyGroupReply } from '../shared/chat/group-empty-reply';
import { unwrapSendArguments } from '../electron/core/group/group-response';

test('only complete empty placeholders and model ending markers are suppressed', () => {
  for (const value of ['', '  ', '<|eos|>', ' <|eos|>\n<|im_end|> ', '（空消息，无需回应）', '(空消息,无需回复)'])
    assert.equal(isEmptyGroupReply(value), true, value);
  for (const value of [
    '这个 <|eos|> 是模型的结束标记。',
    '`<|eos|>`',
    '“（空消息，无需回应）”不应该发送。',
    '方案已确认。',
    '这个界面展示空消息，无需回应。',
  ])
    assert.equal(isEmptyGroupReply(value), false, value);
});

test('a message that only announces the Bot is not speaking is silent', () => {
  for (const value of [
    '（不发言）',
    '(不发言)',
    '【保持沉默】',
    '[静默]',
    '*保持沉默*',
    '（这轮我先不插话）',
    '（无需我回复）',
    '(staying silent)',
    '*stays quiet*',
    '[no reply]',
    '不发言',
    '不发言。',
    '我这次就不发言了。',
    '保持沉默',
    '决定不发言',
    '本轮不回复。',
    '暂无补充。',
    'Nothing to add.',
    "I'll stay quiet.",
    '决定不发言，B 已经回答得很完整了。',
    'A 已经说清楚了，我就不重复了。',
    '不发言：问题已被回答',
    '(not speaking)',
    'I’m staying silent.',
    '我就不说了',
    '上面都讲过了，我也不补充了。',
    'B 已经回答了。\n（不发言）',
    '（不发言，B 已经回答了）',
  ])
    assert.equal(isEmptyGroupReply(value), true, value);
});

test('real answers that mention silence or skipping stay visible', () => {
  for (const value of [
    '沉默是金。',
    '保持沉默不是好办法，建议直接问用户。',
    '我先不发言，但要提醒：接口还没加鉴权。',
    '不发言的成员会在下一轮被提醒吗？',
    '@B 你来回答吧，我不重复了。',
    '测试结果：pass',
    'pass',
    'skip',
    '不用重复部署，只需重启服务即可。',
    '（补充：缓存失效时间是 5 分钟）',
    '（不发言，但提醒一下 token 快过期了）',
    '“（不发言）”这种占位文本不应该发到群里。',
    '如果用户取消，不回复。',
    '这个界面展示空消息，无需回应。',
    // Real content next to a quiet clause is never dropped.
    '部署要先跑迁移，其他 A 说过了，我不重复了。',
    '测试用例我已经补充了，就不多说了。',
    'B 已经回答了。',
    '（这个接口不回复 404）',
    '（不发言？）',
    '跳过登录页这一步会导致权限校验失败，需要先修复鉴权逻辑，再继续测试后面的流程。',
  ])
    assert.equal(isEmptyGroupReply(value), false, value);
});

test('placeholders that say there is nothing new, and echoed message records, are silent', () => {
  for (const value of [
    '（本轮无新增内容。）',
    '（本轮无内容需要发言。）',
    '（无新信息，本轮不发言。）',
    '无新增内容，本轮不发言。',
    '（本轮无新增内容，保持静默。）',
    '（无新增内容，本轮结束。）',
    '（本轮无补充，保持安静。）',
    '（不发言：A 的批评针对的是 B，他已认错；我没有新信息可补。）',
    '[No content]',
    'No text.',
    "No response needed — these messages aren't addressed to me and add nothing new.",
    '{"messageId":"m1","seq":97,"sender":{"kind":"bot","id":"b","name":"B"},"kind":"message","content":"[No content]","attachments":[],"mentions":[],"mentioned":false}',
    '[{"messageId":"m1","seq":1,"content":"x"}]',
  ])
    assert.equal(isEmptyGroupReply(value), true, value);
  for (const value of [
    '不给',
    '无',
    '结束',
    '本轮结束了吗？',
    '没有新增依赖，可以直接合并。',
    '新版本无新增依赖。',
    'No content-type header is set, so the upload fails.',
    'No text is shown on the login page.',
    '{"status":"ok","messageId":"m1"}',
    '（无新增内容，但提醒一下 token 快过期了）',
  ])
    assert.equal(isEmptyGroupReply(value), false, value);
});

test('a short message wholly inside <…>, […], 【…】 or *…* is a stage direction, whatever its words', () => {
  for (const value of [
    '<no further content>',
    '<nothing to say>',
    '<silence>',
    '[pass]',
    '[无]',
    '【略】',
    '*nods*',
    'No further content.',
  ])
    assert.equal(isEmptyGroupReply(value), true, value);
  for (const value of [
    '<br>',
    '<div>',
    '[1]',
    '[x]',
    '[链接](https://example.com)',
    '<需要我来做吗？>',
    '[@B 你来]',
    '<但是要注意兼容性>',
    '**部署完成**',
    '__已上线__',
    '（补充：缓存失效时间是 5 分钟）',
  ])
    assert.equal(isEmptyGroupReply(value), false, value);
});

test('English status replies that start like a placeholder stay visible', () => {
  for (const value of [
    'No updates. The deploy is still blocked by CI.',
    'No update.',
    'No information.',
    'No reply needed - the fix is in main.',
  ])
    assert.equal(isEmptyGroupReply(value), false, value);
  for (const value of ['No reply needed - already answered by B.', 'No new information.'])
    assert.equal(isEmptyGroupReply(value), true, value);
});

test('only JSON shaped like group_send_message arguments is unwrapped', () => {
  assert.equal(unwrapSendArguments('{"groupId":"g","message":"早上好"}'), '早上好');
  for (const value of [
    '{"message":"只有一个字段"}',
    '{"status":"ok","message":"done"}',
    '早上好',
    '{"groupId":"g","message":3}',
  ])
    assert.equal(unwrapSendArguments(value), value);
});
