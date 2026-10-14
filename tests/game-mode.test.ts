import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers';
import { GameRuntime, type Decide } from '../electron/core/games/runtime';
import { gameMode } from '../electron/core/games/modes';
import { errorCode } from '../shared/errors';
import type { GameModeId } from '../shared/types/game-types';

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '玩家' + i, color: '#887799', human: i === 0 }));
// Models never answer: these tests only look at how matches are created and loaded.
const decide: Decide = () => new Promise(() => {});

test('a match without a mode is Werewolf, before and after a restart', (t) => {
  const dir = tempDir(t);
  const runtime = new GameRuntime(dir, decide);
  try {
    const created = runtime.create({ groupId: 'g', players: players(7) });
    assert.equal(created.mode, 'werewolf');
    runtime.control(created.id, 'pause');
  } finally {
    runtime.dispose();
  }
  // Matches saved before game modes existed carry no mode field.
  const file = join(dir, 'matches.json');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  for (const match of saved) delete match.mode;
  writeFileSync(file, JSON.stringify(saved));
  const recovered = new GameRuntime(dir, decide);
  try {
    assert.equal(recovered.read('g')?.mode, 'werewolf');
  } finally {
    recovered.dispose();
  }
});

test('the game mode checks the seat count before creating a match', (t) => {
  const runtime = new GameRuntime(tempDir(t), decide);
  try {
    assert.throws(() => runtime.create({ groupId: 'g', mode: 'werewolf', players: players(8) }), /七位或十二位/);
    assert.equal(runtime.read('g'), null);
    assert.equal(runtime.create({ groupId: 'g', mode: 'werewolf', players: players(12) }).seats.length, 12);
  } finally {
    runtime.dispose();
  }
});

test('an unknown game is refused with a stable code', (t) => {
  assert.throws(
    () => gameMode('chess' as GameModeId),
    (e) => errorCode(e) === 'game.unknown_mode',
  );
  const runtime = new GameRuntime(tempDir(t), decide);
  try {
    assert.throws(
      () => runtime.create({ groupId: 'g', mode: 'chess' as GameModeId, players: players(7) }),
      (e) => errorCode(e) === 'game.unknown_mode',
    );
  } finally {
    runtime.dispose();
  }
});
