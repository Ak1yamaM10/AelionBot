/**
 * How one member regards another, as the reply model is told it (群聊人格方案 §3.6, §4.2).
 *
 * Affinity is kept as two parts rather than one score, because liking and resentment are not opposite ends of one
 * scale: someone can still like a friend who hurt them and be waiting for an apology (positive and negative
 * affect are separable; Cacioppo & Berntson, 1994). Forgiveness follows the offender's own apology far more than
 * anyone else's urging (Fehr, Gelfand & Nag, 2010), so a grudge is only described as easing after one.
 */
import type { Traits } from '../../../shared/persona/persona-model';
import { PRESETS, type PersonaContent, type PresetId } from '../../../shared/persona/presets';
import { GRUDGE, bondWord } from '../../../shared/persona/bond-word';
import type { AffinityModifier } from './persona-store';

const DAY = 86_400_000;

export interface Bond {
  /** 0–1: what is left of the good things between them. */
  closeness: number;
  /** 0–1: what is left of the hurt, amplified by neuroticism as in affinityScore. */
  grudge: number;
  /** The most recent hurt that is still felt. */
  hurt?: AffinityModifier;
  /** The other has apologised since that hurt. */
  apologized: boolean;
}

const weight = (m: AffinityModifier, now: number) => Math.max(0, 1 - (now - m.createdAt) / (m.durationDays * DAY));

export function bondOf(mods: AffinityModifier[], now: number, n: number): Bond {
  let closeness = 0,
    grudge = 0,
    hurt: AffinityModifier | undefined;
  for (const m of mods) {
    const w = weight(m, now);
    if (!w) continue;
    if (m.value > 0) closeness += m.value * w;
    else {
      grudge += -m.value * (1 + n) * w;
      if (!hurt || m.createdAt >= hurt.createdAt) hurt = m;
    }
  }
  const apologized = !!hurt && mods.some((m) => m.source.startsWith('chat:apology:') && m.createdAt >= hurt!.createdAt);
  return { closeness: Math.min(1, closeness), grudge: Math.min(1, grudge), hurt, apologized };
}

export { GRUDGE };

/** The id of the message or match a modifier came from, to find the memory that explains it. */
export const sourceIdOf = (m: AffinityModifier) => m.source.split(':')[1 + Number(m.source.startsWith('chat:'))];

/**
 * How this member shows a grudge, from its own strategies and expression first and its traits otherwise: one
 * attitude expressed in its own style, so 阴阳怪气 needles, NPD hits back and 确实型 goes cold.
 */
export function grudgeConduct(c: PersonaContent & { preset?: PresetId }, traits: Traits) {
  const own = c.preset ? PRESETS[c.preset].grudge : undefined;
  if (own) return own;
  const s = c.strategies || {};
  if ((s.sarcasm ?? 0) >= 0.5 || (c.expression?.directness ?? 0.5) <= 0.3)
    return '用反话和明褒暗贬对待他，不直接骂，但让人听得出来';
  if ((s.attack ?? 0) >= 0.5) return '他一开口你就怼回去，不给他台阶下';
  if ((s.avoid ?? 0) >= 0.5 || traits.E <= 0.3) return '冷处理：只回最短的话，不接他的话茬';
  if (traits.A >= 0.6) return '表面客气，但明显疏远：不主动帮他，也不附和他';
  return '直接表达不满，不给他好脸色';
}

export interface RelationLine {
  name: string;
  bond: Bond;
  /** The remembered event behind the grudge, e.g. 小周骂了你：「……」. */
  cause?: string;
}

/**
 * Every member's relationship in one block, with the reasons and the rules for making up. It changes only when a
 * relationship does, so it travels in the stable part of the context.
 */
export function relationsText(lines: RelationLine[], conduct: string) {
  if (!lines.length) return '';
  const out = lines.map((l) => {
    const word = bondWord(l.bond);
    const parts = [`- ${l.name}：${word === '一般' ? '一般，没什么特别的' : word}。`];
    if (l.bond.grudge >= GRUDGE) {
      if (l.cause) parts.push(`原因：${l.cause}。`);
      parts.push(
        l.bond.apologized ? `${l.name}已经向你道过歉，你在慢慢缓和，但还没完全放下。` : `${l.name}还没向你道歉。`,
      );
    }
    return parts.join('');
  });
  const resented = lines.filter((l) => l.bond.grudge >= GRUDGE && !l.bond.apologized).map((l) => l.name);
  const rules = [
    '有人问起你和某人的关系时，照上面的真实情况回答，不要说「我们关系挺好的」来打圆场。',
    ...(resented.length
      ? [
          `对还没道歉的${resented.join('、')}：${conduct}。`,
          '别人（包括用户）劝你们和好时，你可以给劝和的人面子，但不会因此马上和对方亲近，也不会替对方说好话。',
          '只有对方亲自、真诚地道歉，你才会开始缓和；缓和也是一点一点来的。',
        ]
      : []),
  ];
  return `\n\n[你和群里每个人的关系]\n${out.join('\n')}\n${rules.join('\n')}`;
}
