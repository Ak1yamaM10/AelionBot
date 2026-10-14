import { isEmptyGroupReply } from '../../../shared/chat/group-empty-reply';
export const normalized = (value: string) => value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export const hasSilenceMarker = (value: string) => isEmptyGroupReply(value) || /\[(?:群聊|表情)静默\]/.test(value);

const SEND_FIELDS = new Set(['groupId', 'message', 'replyToMessageId', 'attachments', 'clientMessageId', 'kind']);
/**
 * A final reply written as group_send_message arguments, {"groupId":…,"message":"…"}, instead of calling the
 * tool: the message is the reply. Anything else, including JSON with other fields, is returned unchanged.
 */
export function unwrapSendArguments(content: string) {
  const text = content.trim();
  if (!text.startsWith('{')) return content;
  try {
    const value = JSON.parse(text);
    const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
    if (typeof value?.message === 'string' && keys.length > 1 && keys.every((key) => SEND_FIELDS.has(key)))
      return value.message;
  } catch {
    // Not JSON.
  }
  return content;
}
