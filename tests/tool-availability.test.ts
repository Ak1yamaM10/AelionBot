import test from 'node:test';
import assert from 'node:assert/strict';
import { reactionRestriction, reactionRestrictionContext } from '../electron/core/tools/tool-availability';

test('reactions stay available during active work; only a duplicate chat pin is blocked', () => {
  assert.equal(reactionRestriction('chat_pin'), undefined);
  assert.equal(reactionRestriction('group_react'), undefined);
  assert.match(reactionRestriction('chat_pin', true)!, /相同表态/);
  assert.equal(reactionRestriction('group_react', true), undefined);
  assert.equal(reactionRestriction('file_read', true), undefined);
});

test('the prompt only mentions a duplicate reaction, not active work', () => {
  assert.equal(reactionRestrictionContext(false), '');
  const context = reactionRestrictionContext(true);
  assert.match(context, /chat_pin/);
  assert.match(context, /相同表态/);
  assert.doesNotMatch(context, /计划|目标|继续工作/);
});
