import type { GroupSocialHooks } from '../group/group-chats';
import type { LayaRuntime } from '../model/laya-runtime';
import {
  APPRAISAL_INSTRUCTIONS,
  APPRAISAL_TYPES,
  appraisalCriteria,
  appraisalPrompt,
  parseAppraisal,
  type Appraisal,
  type AppraisalInput,
  type AppraisalType,
} from './appraisal';
import type { PersonaService } from './persona-service';
import {
  JUDGE_CRITERIA,
  JUDGE_INSTRUCTIONS,
  VERDICTS,
  judgePrompt,
  parseVerdict,
  type JudgeInput,
  type Verdict,
} from './speech';

/** Asks a Bot's own model; returns the raw reply text. */
export type AskBot = (botId: string, system: string, user: string) => Promise<string>;

/**
 * Classify with the local Laya model when it is running (free, coarser), otherwise with the aimed-at Bot's own
 * model. Undefined when neither answered; nothing is recorded then.
 */
export function appraiser(laya: Pick<LayaRuntime, 'enabled' | 'isReady' | 'predict'> | undefined, ask: AskBot) {
  return async (botId: string, input: AppraisalInput): Promise<Appraisal | undefined> => {
    if (laya?.enabled && laya.isReady) {
      const result = await laya.predict(input, {
        type: 'choice',
        instructions: APPRAISAL_INSTRUCTIONS,
        criteria: appraisalCriteria(),
      });
      if (result && APPRAISAL_TYPES.includes(result.choice as AppraisalType))
        return { type: result.choice as AppraisalType, intensity: result.confidence ?? 0.5 };
    }
    const prompt = appraisalPrompt(input);
    return parseAppraisal(await ask(botId, prompt.system, prompt.user));
  };
}

/** The character check, with the same order of models as the appraiser. */
export function judger(laya: Pick<LayaRuntime, 'enabled' | 'isReady' | 'predict'> | undefined, ask: AskBot) {
  return async (botId: string, input: JudgeInput): Promise<Verdict | undefined> => {
    if (laya?.enabled && laya.isReady) {
      const result = await laya.predict(input, {
        type: 'choice',
        instructions: JUDGE_INSTRUCTIONS,
        criteria: JUDGE_CRITERIA,
      });
      if (result && VERDICTS.includes(result.choice as Verdict)) return result.choice as Verdict;
    }
    const prompt = judgePrompt(input);
    return parseVerdict(await ask(botId, prompt.system, prompt.user));
  };
}

/** Bounded so a busy group cannot queue unlimited classification calls. */
const MAX_PENDING = 20;

/** The persona side of group activity: profiles for new members, and relationships from aimed messages. */
export function groupSocialHooks(
  persona: Pick<PersonaService, 'appraise' | 'ensureGroupProfiles' | 'spoke' | 'judged'>,
  bots: (ids: string[]) => { id: string; name: string; soul: string }[],
  classify: (botId: string, input: AppraisalInput) => Promise<Appraisal | undefined>,
  ask: AskBot,
  report: (error: unknown) => void = () => {},
  judge?: (botId: string, input: JudgeInput) => Promise<Verdict | undefined>,
): GroupSocialHooks {
  let pending = 0;
  let chain = Promise.resolve();
  // One classification at a time, in publication order, so a burst cannot reorder a grudge and its apology.
  const enqueue = (work: () => Promise<void>) => {
    if (pending >= MAX_PENDING) return;
    pending++;
    chain = chain
      .then(work)
      .catch(report)
      .finally(() => pending--);
  };
  return {
    joined: (ids) => void persona.ensureGroupProfiles(bots(ids), ask).catch(report),
    aimed: (event) => {
      for (const target of event.targets)
        enqueue(async () => {
          const appraisal = await classify(target.id, {
            target: target.name,
            sender: event.sender.name,
            message: event.text.slice(0, 600),
            ...(event.repliedTo ? { repliedTo: event.repliedTo } : {}),
          });
          if (!appraisal) return;
          persona.appraise({
            botId: target.id,
            actorId: event.sender.id,
            actorName: event.sender.name,
            appraisal,
            quote: event.text,
            groupId: event.groupId,
            sourceId: event.messageId,
          });
        });
    },
    // Runs after publication and only leaves a reminder for the next turn, so a reply is never held up.
    spoke: (event) => {
      const input = persona.spoke(event.botId, event.text, event.people);
      if (!input || !judge) return;
      enqueue(async () => {
        const verdict = await judge(event.botId, input);
        if (verdict) persona.judged(event.botId, verdict, event.people);
      });
    },
  };
}
