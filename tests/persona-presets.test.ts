import test from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers';
import { PersonaService } from '../electron/core/persona/persona-service';
import { PRESETS, PRESET_IDS, contentText } from '../shared/persona/presets';
import { contentWeight } from '../electron/core/persona/appraisal';

const DAY = 86_400_000;
function service(t: test.TestContext) {
  const svc = new PersonaService(tempDir(t), () => 1_000 * DAY);
  t.after(() => svc.close());
  return svc;
}
const names = (id: string) => ({ user: '何梓鸿', b: '小周' })[id];
const insult = (botId: string, actorId: string, sourceId: string) => ({
  botId,
  actorId,
  actorName: actorId,
  appraisal: { type: 'insult' as const, intensity: 1 },
  quote: '你怎么这么笨',
  groupId: 'g',
  sourceId,
});

test('every preset is a full setting of the same parameters and contents, and reads as instructions', () => {
  for (const id of PRESET_IDS) {
    const p = PRESETS[id];
    assert.ok(p.motives && p.selfView && p.strategies && p.expression, id);
    const text = contentText({ ...p, preset: id }, names);
    assert.ok(text.includes(`你的人设：${p.name}`), id);
    assert.ok(text.includes('口头禅'), id);
    assert.ok(text.includes('夸张'), id);
  }
  assert.match(contentText({ ...PRESETS.yinyang, preset: 'yinyang' }, names), /只用反话、明褒暗贬/);
  assert.match(contentText({ ...PRESETS.queshi, preset: 'queshi' }, names), /回复极短/);
  assert.match(contentText({ ...PRESETS.simp, preset: 'simp' }, names), /心思几乎全在何梓鸿身上/);
  assert.match(contentText({ ...PRESETS.npd, preset: 'npd' }, names), /几乎不会：道歉/);
  assert.equal(contentText({}, names), '', 'a Bot without contents gets no persona block');
});

test('applying a preset sets traits and contents; the group style carries them; clearing keeps the traits', (t) => {
  const svc = service(t);
  const view = svc.applyPreset('A', 'npd');
  assert.equal(view.profile.preset, 'npd');
  assert.equal(view.profile.source, 'preset');
  assert.equal(view.profile.confirmed, true);
  assert.deepEqual(view.profile.traits, PRESETS.npd.traits);
  assert.deepEqual(view.profile.anchor, PRESETS.npd.traits, 'the preset becomes the birth personality');
  const style = svc.groupStyle('A', names);
  assert.match(style, /你的人设：NPD/);
  assert.match(style, /发言不超过 \d+ 字/);
  const cleared = svc.applyPreset('A', '');
  assert.equal(cleared.profile.preset, undefined);
  assert.equal(cleared.profile.expression, undefined);
  assert.deepEqual(cleared.profile.traits, PRESETS.npd.traits);
  assert.throws(() => svc.applyPreset('A', 'nope'), /未知的人格预设/);
});

test('a 舔狗 barely minds its target scolding it, and a hand-set personality drops the preset name', (t) => {
  const svc = service(t);
  svc.applyPreset('A', 'simp', 'user');
  svc.applyPreset('B', 'npd');
  svc.appraise(insult('A', 'user', 'm1'));
  svc.appraise(insult('A', 'c', 'm2'));
  svc.appraise(insult('B', 'user', 'm3'));
  const fromTarget = svc.store.affinity('A', 'user')[0].value,
    fromOther = svc.store.affinity('A', 'c')[0].value,
    toNpd = svc.store.affinity('B', 'user')[0].value;
  assert.ok(Math.abs(fromTarget) < Math.abs(fromOther) / 4, 'the target costs it almost nothing');
  assert.ok(Math.abs(toNpd) > 0.5 * 1.3, 'a fragile self-view makes an insult hurt more');
  const set = svc.setTraits('A', PRESETS.simp.traits);
  assert.equal(set.profile.preset, undefined);
  assert.equal(set.profile.focus, 'user', 'learned contents stay');
});

test('content weights are neutral for an ordinary Bot', () => {
  assert.equal(contentWeight('insult', -0.5, {}, 'user'), 1);
  assert.equal(contentWeight('thanks', 0.1, {}, 'user'), 1);
  assert.equal(contentWeight('thanks', 0.1, { motives: { agency: 1, communion: 0 } }, 'user'), 1.5);
  assert.equal(contentWeight('help', 0.1, { motives: { agency: 1, communion: 0 } }, 'user'), 0.5);
});
