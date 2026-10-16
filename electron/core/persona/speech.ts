/**
 * The per-turn speech plan and the after-the-fact character check (群聊人格方案 §4.2 ③ 表达、⑤ 评估).
 *
 * The plan is decided in code before the model writes, so a preset's habits happen at a set rate instead of
 * whenever the model remembers them: the strategy is sampled from the Bot's preferences, and a catchphrase is
 * asked for only while recent messages used fewer than its rate, the least recently used one first.
 *
 * The check never delays or rewrites a reply. It runs after publication on a sample of turns chosen in code, and
 * a failed check leaves a one-line reminder for the Bot's next turn, appended at the end of the per-turn context
 * the way Anthropic appends reminders to long conversations.
 */
import {
  STRATEGY_NAMES,
  catchphraseRate,
  type PersonaContent,
  type PresetId,
  type Strategy,
} from '../../../shared/persona/presets';

/** How many recent messages the catchphrase rate is measured over. */
const WINDOW = 6;

export interface SpeechMemory {
  /** The catchphrase each recent message used, or '' for none; newest last. */
  used: string[];
}

export function speechPlan(c: PersonaContent & { preset?: PresetId }, memory: SpeechMemory, random: () => number) {
  const lines: string[] = [];
  const liked = Object.entries(c.strategies || {}).filter((entry): entry is [Strategy, number] => entry[1] > 0);
  if (liked.length) {
    let pick = random() * liked.reduce((sum, [, v]) => sum + v, 0);
    const strategy = liked.find(([, v]) => (pick -= v) < 0)?.[0] ?? liked[0][0];
    lines.push(`这一轮优先用「${STRATEGY_NAMES[strategy]}」的方式回应，但仍然要回应具体内容。`);
  }
  const phrases = c.expression?.catchphrases || [];
  if (phrases.length) {
    const recent = memory.used.slice(-WINDOW),
      rate = catchphraseRate(c),
      due = recent.length ? recent.filter(Boolean).length / recent.length < rate : random() < rate;
    if (due) {
      const last = (p: string) => recent.lastIndexOf(p);
      const phrase = [...phrases].sort((a, b) => last(a) - last(b))[0];
      lines.push(`这一轮要用口头禅「${phrase}」，自然地放进句子里，放开头也可以。`);
    } else lines.push('这一轮不用口头禅。');
  }
  return lines.length ? '\n\n[本轮说话方式]\n' + lines.join('\n') : '';
}

/** The catchphrase a published message used, longest match first, or '' for none. */
export const usedCatchphrase = (c: PersonaContent, text: string) =>
  [...(c.expression?.catchphrases || [])].sort((a, b) => b.length - a.length).find((p) => text.includes(p)) || '';

export const VERDICTS = ['ok', 'too_friendly', 'out_of_voice'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const JUDGE_INSTRUCTIONS =
  '判断 reply 是否符合说话者 speaker 的人设（persona）和他对相关的人的关系（relations）。只看 reply 本身。';
export const JUDGE_CRITERIA: Record<Verdict, string> = {
  ok: '符合：说话方式和对人的态度都符合人设与关系',
  too_friendly: '太友好：对还有怨气、还没道歉的人表现得亲近、替他说好话，或者被劝一句就和好了',
  out_of_voice: '不像本人：没有人设的语气、口头禅或说话习惯，读起来像一个普通的助手',
};
export interface JudgeInput {
  speaker: string;
  persona: string;
  relations: string;
  reply: string;
}
export function judgePrompt(input: JudgeInput) {
  const kinds = Object.entries(JUDGE_CRITERIA)
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');
  return {
    system: `${JUDGE_INSTRUCTIONS}\n类别：\n${kinds}\n仅返回 JSON：{"verdict":"类别"}`,
    user: JSON.stringify(input),
  };
}
export function parseVerdict(raw: string): Verdict {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { verdict?: unknown };
    return VERDICTS.includes(parsed.verdict as Verdict) ? (parsed.verdict as Verdict) : 'ok';
  } catch {
    return 'ok';
  }
}
/** The reminder a failed check leaves for the next turn. */
export function reminderFor(verdict: Verdict, resented: string[]) {
  if (verdict === 'too_friendly' && resented.length)
    return `提醒：你上一条对${resented.join('、')}太友好了。他还没向你道歉，你没有原谅他，不要装作没事。`;
  if (verdict === 'out_of_voice') return '提醒：你上一条不像你自己，更像一个普通助手。回到你的说话方式和口头禅。';
  return '';
}
