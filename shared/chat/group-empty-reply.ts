// Phrases that only say the Bot is not speaking. Kept specific so real answers never match.
const QUIET_CN =
  '保持(?:沉默|静默|安静)|沉默|静默|潜水|' +
  '不(?:再|多)?(?:发言|说话|出声|吭声|插话|接话|回复|回应|作答|打扰|重复|赘述|补充|说了|回了|接了)|' +
  '(?:无需|不(?:需要|用|必))我?(?:发言|回复|回应|作答|补充)|' +
  '(?:没有|暂无|无)(?:新的?|其他|更多|别的|要|可以)?(?:补充|要说的|可说的)|' +
  // "本轮无新增内容", "无新信息", "没有新内容可补", "无内容需要发言"
  '(?:没有|暂无|无)(?:任何)?(?:新增|新的?|其他|更多)?(?:内容|信息|观点|意见)(?:需要|要|可|可以)?(?:发言|补充?|说)?|' +
  '(?:本轮|这轮|此轮)结束';
const QUIET_EN =
  "(?:i(?:['’]m| am|['’]ll| will)? )?(?:stay(?:s|ing)? (?:quiet|silent)|remain(?:s|ing)? silent|silent|silence|" +
  'not (?:speaking|replying|responding|commenting)|no (?:reply|response|comment|need to reply)|nothing (?:new )?to add|' +
  'no (?:further |more |new |additional |other )?(?:content|text|info|information|input|message|output|update|comment)s?|' +
  'nothing (?:new|further|more)|no (?:reply|response) (?:needed|required|necessary))';
// "No response needed — these messages aren't addressed to me": an English declaration followed by its reason.
const DECLARATION_EN = new RegExp(`^\\[?(?:${QUIET_EN})\\]?(?:\\s*[—–]|\\s+-\\s|\\.\\s|[.!]?$)`, 'i');
// A declaration clause: optional subject, time or connective words, the quiet phrase, optional particles.
const DECLARATION = new RegExp(
  '^(?:(?:我|本\\s*bot|这次|这轮|本轮|此轮|这里|此处|暂时|目前|先|就|也|那|那么|所以|因此|还是|继续|选择|决定|[，,\\s])*' +
    `(?:${QUIET_CN})(?:了|啦|吧|呢|中|一下|这轮|本轮)*|${QUIET_EN})$`,
  'i',
);
// Stage directions such as （不发言）, [no reply] or *stays quiet*.
const WRAPPED = /^(?:[（(【[]\s*([^（）()【】[\]]{1,40}?)\s*[）)】\]]|(\*{1,2}|_)\s*([^*_]{1,40}?)\s*\2)$/;
// A clause that only says others already covered it, e.g. "B 已经回答了" or "问题已被回答".
const COVERED =
  /^[^，,：:；;。.!！?？]{0,24}(?:已经?|都|早就?)(?:被)?(?:回答|答|说|讲|解释|提到|覆盖|说明)(?:过|了|完|清楚|得很?(?:完整|清楚|全面|详细)|到位)*$|^\w[\w\s]{0,24}(?:already|has|have)\s+(?:answered|covered|said|explained)\b[^.!?]*$/i;
// "这部分我已经说明了" may report the Bot's own work, so only others covering it counts as a reason.
const covered = (clause: string) => COVERED.test(clause) && !/我|\bi\b/i.test(clause);
// Anything that adds a point keeps the message visible.
const ADDS_SOMETHING = /[?？@]|但|不过|只是|然而|提醒|注意|建议|另外|风险|\b(?:but|however|note)\b/i;
const TRAILING = /[\s。.!！~～…]+$/;
const SELF = /我|决定|选择|就|先|也|这轮|本轮|此轮|这次|发言|说话|插话|接话|沉默|静默|出声|吭声|\bi\b/i;

// A whole message in brackets is a stage direction; one that opens with "不发言" is silent whatever reason follows.
const STAGE = /^[（(【[]\s*([^（）()【】[\]]{1,160}?)\s*[）)】\]][。.]?$/;
// "无新增内容" is about the Bot's own reply even without a subject.
const NOTHING_NEW = /^(?:本轮|这轮|此轮|我)*(?:没有|暂无|无)/;
const strip = (clause: string) => clause.trim().replace(TRAILING, '');
const directive = (clause: string): boolean => {
  const wrapped = WRAPPED.exec(clause.trim());
  if (wrapped) return announcesSilence((wrapped[1] ?? wrapped[3]).trim());
  return DECLARATION.test(strip(clause));
};
// Split on sentence punctuation, keeping a bracketed stage direction as one clause.
const clausesOf = (text: string) =>
  (text.match(/[（(【[][^（）()【】[\]]*[）)】\]]|(\*{1,2}|_)[^*_\n]*\1|[^，,：:；;。.!！\n（(【[*_]+/g) || [])
    .map((part) => part.trim().replace(TRAILING, ''))
    .filter(Boolean);

/**
 * A whole message whose only content is "I am not speaking": （不发言）, 保持沉默。, or a
 * declaration with a short "already covered" reason such as 决定不发言，B 已经回答了。
 */
function announcesSilence(text: string): boolean {
  if (!text || ADDS_SOMETHING.test(text)) return false;
  const stage = STAGE.exec(text);
  if (stage && directive(clausesOf(stage[1])[0] || '')) return true;
  if (text.length <= 200 && /^[a-z[]/i.test(text) && DECLARATION_EN.test(text)) return true;
  if (text.length > 80) return false;
  if (directive(text)) return true;
  const clauses = clausesOf(text);
  if (clauses.length < 2) return false;
  let declared = false;
  for (const clause of clauses) {
    // Next to other text, a bare quiet phrase must be about the Bot: "如果用户取消，不回复" stays visible.
    if (directive(clause) && (WRAPPED.test(clause) || SELF.test(clause) || NOTHING_NEW.test(clause))) declared = true;
    else if (!covered(clause)) return false;
  }
  return declared;
}

/**
 * The shape, not the wording: a short message wholly inside <…>, […], 【…】 or *…* (italics, not bold) is a stage direction such as
 * <no further content>, whatever words a model invents. Parentheses are left to announcesSilence, since
 * "（补充：缓存 5 分钟）" is a real aside. Questions, @ and links stay visible.
 */
const STAGE_DIRECTION = /^(?:<([^<>]{1,80})>|\[([^[\]]{1,80})\]|【([^【】]{1,80})】|(\*|_)([^*_]{1,80})\4)[。.!！]?$/;
function stageDirection(text: string) {
  const match = STAGE_DIRECTION.exec(text);
  if (!match) return false;
  const inner = (match[1] ?? match[2] ?? match[3] ?? match[5]).trim();
  // <br>, <div>, [1], [x] and [ ] are markup, not narration.
  if (
    match[1] !== undefined &&
    /^\/?(?:br|hr|p|div|span|b|i|u|em|strong|code|pre|img|a|ul|ol|li|h[1-6]|sup|sub)\b[^>]*$/i.test(inner)
  )
    return false;
  if (/^[\dx ]{0,3}$/i.test(inner) || /[?？@]|https?:\/\//i.test(inner) || ADDS_SOMETHING.test(inner)) return false;
  return true;
}

/** A group message record such as {"messageId":…,"sender":…} copied back from the model's input. */
function echoedRecord(text: string) {
  if (!/^[[{]/.test(text)) return false;
  try {
    const value = JSON.parse(text);
    const records = Array.isArray(value) ? value : [value];
    return (
      records.length > 0 &&
      records.every((r) => r && typeof r === 'object' && 'messageId' in r && ('sender' in r || 'seq' in r))
    );
  } catch {
    return false;
  }
}

/** Only whole-message control output is silent; explanations quoting these strings remain visible. */
export function isEmptyGroupReply(value: string) {
  const text = value.trim();
  return (
    !text ||
    /^(?:<\|(?:eos|eot_id|endoftext|im_end)\|>\s*)+$/i.test(text) ||
    /^(?:[（(]\s*)?空消息\s*[,，]\s*无需回[应复]\s*(?:[）)])?[。.!！]?$/.test(text) ||
    announcesSilence(text) ||
    stageDirection(text) ||
    echoedRecord(text)
  );
}
