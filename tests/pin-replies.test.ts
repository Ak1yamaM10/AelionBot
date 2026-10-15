import test from 'node:test';
import assert from 'node:assert/strict';
import { pinReferenceMarkdown, pinReplies } from '../shared/preview/pin-replies';
import { pinThreads } from '../src/preview/pin-thread';

const marks = [
  { id: 'a', n: 1, title: '按钮' },
  { id: 'b', n: 2, title: '标题' },
  { id: 'c', n: 3, title: '区域' },
];

test('a reply answers each pin by number, and says when one was left unchanged', () => {
  const replies = pinReplies(marks, [
    '改好了：\n- **#1** 按钮改成了主色。\n- #2 标题没改，现有字号已经是规范里的上限。\n\n`#3` 在代码里不算。',
  ]);
  assert.deepEqual(replies.get('a'), { status: 'done', reply: '#1 按钮改成了主色。' });
  assert.equal(replies.get('b')?.status, 'kept');
  assert.equal(replies.has('c'), false);
});

test('one line naming several pins gives each its own words', () => {
  const replies = pinReplies(marks, ['#1 changed the colour; #3 left as it was because the grid needs it.']);
  assert.equal(replies.get('a')?.status, 'done');
  assert.match(replies.get('a')!.reply, /changed the colour/);
  assert.equal(replies.get('c')?.status, 'kept');
  assert.doesNotMatch(replies.get('c')!.reply, /changed the colour/);
});

test('only real references become links: not headings, entities, longer numbers or code', () => {
  const text = '## Notes\nSee #1 and #20, C#2, &#3; and `#2`.\n```\n#3\n```';
  assert.equal(
    pinReferenceMarkdown(text, new Set([1, 2, 3])),
    '## Notes\nSee [#1](aelion-pin:1) and #20, C#2, &#3; and `#2`.\n```\n#3\n```',
  );
  assert.equal(pinReferenceMarkdown(text, new Set()), text);
});

test('replies belong to the latest comment message before them; its pins work while the Bot runs', () => {
  const messages = [
    { id: 'u1', fromUser: true, content: 'first', previewMarks: [marks[0]] },
    { id: 'r1', fromUser: false, content: '#1 done.' },
    { id: 'u2', fromUser: true, content: 'second', previewMarks: [marks[1], marks[2]] },
    { id: 'r2', fromUser: false, content: '#2 updated.' },
  ];
  const running = pinThreads(messages, true);
  assert.deepEqual(running.refs.get('r1'), [{ id: 'a', n: 1, status: 'done' }]);
  assert.deepEqual(
    running.refs.get('r2')?.map((ref) => ref.status),
    ['done', undefined],
  );
  assert.deepEqual(Object.keys(running.latest), ['b', 'c']);
  assert.equal(running.latest.b.status, 'done');
  assert.equal(running.latest.c.status, 'working');
  assert.equal(pinThreads(messages, false).latest.c.status, 'sent');
  assert.equal(pinThreads([{ id: 'x', fromUser: true, content: 'hi' }], false).refs.size, 0);
});
