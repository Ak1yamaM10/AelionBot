// Matching a Bot's reply to the preview comments it answers: the comment message records its pins (#1, #2…), and
// the reply refers to them by number. Each pin gets the words written about it and whether it was changed.
import type { PreviewMarkRef } from './preview-annotations';

export interface PinReply {
  status: 'done' | 'kept';
  /** The reply's words about this pin, as plain text. */
  reply: string;
}
/** "#3" as a reference, not part of "#30", "C#3", an HTML entity or a heading. */
const REFERENCE = /(^|[^\w&#/])#(\d{1,3})(?!\d)/g;
/** Words that say a pin was left as it was. */
const KEPT =
  /没改|未改|没有改|没动|未动|没有动|保留|暂不|先不|不改|未修改|没有修改|維持|沒改|沒動|未變|not (?:changed|modified|touched)|unchanged|left (?:it )?as|kept|skipped|didn'?t change|did not change/i;
const plain = (text: string) =>
  text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|~~/g, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
/** Splits text into code (fenced blocks and inline spans) and the rest, so references in code stay as they are. */
function outsideCode(text: string) {
  const parts: Array<{ text: string; code: boolean }> = [];
  const pattern = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > at) parts.push({ text: text.slice(at, match.index), code: false });
    parts.push({ text: match[0], code: true });
    at = match.index! + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), code: false });
  return parts;
}
/**
 * What a reply says about each pin it names: the line that names it (from its number up to the next pin's number
 * when one line names several), marked kept when that line says it was left unchanged.
 */
export function pinReplies(marks: PreviewMarkRef[], answers: string[]) {
  const byNumber = new Map(marks.map((mark) => [mark.n, mark])),
    result = new Map<string, PinReply>();
  for (const answer of answers)
    for (const part of outsideCode(answer)) {
      if (part.code) continue;
      for (const line of part.text.split('\n')) {
        const found = [...line.matchAll(REFERENCE)].filter((match) => byNumber.has(Number(match[2])));
        found.forEach((match, index) => {
          const mark = byNumber.get(Number(match[2]))!,
            start = match.index! + match[1].length,
            end = found[index + 1] ? found[index + 1].index! + found[index + 1][1].length : line.length,
            // A line naming one pin speaks about it as a whole; with several, each gets its own stretch.
            words = plain(found.length === 1 ? line : line.slice(start, end)),
            reply = words.length > 300 ? words.slice(0, 299) + '…' : words;
          if (!result.has(mark.id)) result.set(mark.id, { status: KEPT.test(words) ? 'kept' : 'done', reply });
        });
      }
    }
  return result;
}
/**
 * Markdown with each reference to a sent pin turned into a link the message renders as the pin's chip. The href
 * scheme is internal and never leaves the app.
 */
export function pinReferenceMarkdown(text: string, numbers: Set<number>) {
  if (!numbers.size) return text;
  return outsideCode(text)
    .map((part) =>
      part.code
        ? part.text
        : part.text.replace(REFERENCE, (whole, before: string, n: string) =>
            numbers.has(Number(n)) ? `${before}[#${n}](aelion-pin:${n})` : whole,
          ),
    )
    .join('');
}
