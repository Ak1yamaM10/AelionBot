import { createContext, memo, useContext, useRef } from 'react';
import { previewFeedbackDisplay } from '../../shared/preview/preview-feedback';
import { MessageQuote } from '../chat/MessageQuote';
import { MessageTime } from '../chat/ConversationTime';
import { clockTime } from '../chat/conversation-time';
import { AttachmentList } from '../files/Attachments';
import { attachmentSummary } from '../../shared/types/attachment-types';
import type { Bot, ChatMessage } from '../../shared/types/core';
import { CONNECTOR_PLATFORM_NAMES } from '../../shared/types/connector-types';
import { readableContent } from '../../shared/chat/activity';
import { legacyQuestionAnswerData, readableQuestionAnswer } from '../../shared/chat/question-answers';
import { QuestionAnswerMessage } from '../chat/QuestionAnswerMessage';
import { MessageActions } from '../chat/MessagePins';
import { ScheduledTriggerCard } from '../chat/ScheduledTrigger';
import { Avatar } from './Avatar';
import { MentionContent } from './MentionContent';
import { usePinRefs } from '../preview/pin-thread';
import { MessageReasoning } from '../chat/MessageReasoning';
import { shallowEqual } from './equality';
import { useI18n } from '../i18n';
import '../chat/message-surfaces.css';

type MessageProps = {
  message: ChatMessage;
  allowPins?: boolean;
  onReply?: (message: ChatMessage) => void;
  /** False when the reasoning is already shown elsewhere, e.g. inside the folded run process. */
  showReasoning?: boolean;
};
// A message re-renders only when it changed: an unchanged one is the same object (see shared/state-sync.ts).
// onReply is compared by presence and read through a ref, so a skipped render still calls the latest callback.
const MemoMessage = memo(
  MessageView,
  (a: MessageProps & { reply: ReplyRef }, b: MessageProps & { reply: ReplyRef }) =>
    a.allowPins === b.allowPins &&
    a.showReasoning === b.showReasoning &&
    Boolean(a.onReply) === Boolean(b.onReply) &&
    shallowEqual(a.message, b.message),
);
type ReplyRef = { current?: (message: ChatMessage) => void };
/** The Bot whose avatar stands beside its messages; the styles show it on the last message of a run of them. */
export const MessageAvatarContext = createContext<Pick<Bot, 'id' | 'name' | 'color' | 'avatarStyle'> | undefined>(
  undefined,
);
export function Message(props: MessageProps) {
  const reply = useRef<(message: ChatMessage) => void>(undefined);
  reply.current = props.onReply;
  return <MemoMessage {...props} reply={reply} />;
}
function MessageView({
  message,
  allowPins = true,
  onReply: hasReply,
  showReasoning = true,
  reply,
}: MessageProps & { reply: ReplyRef }) {
  const onReply = hasReply ? (value: ChatMessage) => reply.current?.(value) : undefined;
  const { t } = useI18n();
  const avatar = useContext(MessageAvatarContext);
  const pins = usePinRefs(message.id);
  if (!showReasoning && message.reasoning) message = { ...message, reasoning: undefined };
  if (message.scheduled)
    return (
      <>
        <MessageTime id={message.id} time={message.time} />
        <div className="scheduled-trigger" data-message-id={message.id}>
          <ScheduledTriggerCard title={message.scheduled.title} content={message.content} time={message.time} />
        </div>
      </>
    );
  if (message.reaction) return null;
  if (message.role === 'event') return <div className="event-message">{message.content}</div>;
  if (message.role === 'tool') return null;
  if (!message.content && !message.attachments?.length && message.status !== 'running' && !message.reasoning?.text)
    return null;
  const presentation = previewFeedbackDisplay(message);
  const answer =
    message.role === 'user' ? message.questionAnswer || legacyQuestionAnswerData(message.content) : undefined;
  const content =
    message.role === 'assistant'
      ? message.content.startsWith('执行检查发现未解决')
        ? t('发现校验问题，继续检查并修正。')
        : readableContent(message.content)
      : readableQuestionAnswer(presentation.content);
  // A model call that only reasoned before its tool calls leaves a single disclosure line, no bubble.
  if (
    message.role === 'assistant' &&
    message.reasoning?.text &&
    !content &&
    !message.attachments?.length &&
    message.status !== 'running'
  )
    return (
      <div className="message-row assistant reasoning-only" data-message-id={message.id}>
        <MessageReasoning reasoning={message.reasoning} />
      </div>
    );
  const images = (message.attachments || []).filter((file) => file.image || file.mime.startsWith('image/')),
    // Images sit above the bubble and other files below it. A message that is only attachments puts them in a
    // see-through bubble so hover actions (reply, pin) still have a target.
    bare = Boolean(message.attachments?.length) && !content && !answer && !message.reply,
    clock = bare || message.status === 'running' || !(content || answer) ? '' : clockTime(message.time);
  return (
    <>
      <MessageTime id={message.id} time={message.time} />
      {message.connector && (
        <div className="message-source">
          {t('来自{platform}', { platform: t(CONNECTOR_PLATFORM_NAMES[message.connector.platform]) })}
        </div>
      )}
      <div className={`message-row ${message.role}`} data-message-id={message.id}>
        {message.role === 'assistant' && avatar && (
          <span className="message-avatar" aria-hidden="true">
            <Avatar bot={avatar} size={30} />
          </span>
        )}
        {message.role === 'assistant' && <MessageReasoning reasoning={message.reasoning} />}
        {!bare && <AttachmentList files={images} only="images" />}
        <MessageActions
          messageId={message.id}
          content={content || attachmentSummary(message.attachments)}
          pins={message.pins}
          onReply={
            onReply &&
            !['running', 'cancelled'].includes(message.status || 'done') &&
            (content || message.attachments?.length)
              ? () => onReply({ ...message, content })
              : undefined
          }
          bubbleClassName={`bubble ${answer ? 'question-answer-bubble' : ''} ${message.status === 'failed' ? 'failed' : ''} ${bare ? 'is-media' : ''} ${clock ? 'has-time' : ''}`}
          after={bare ? undefined : <AttachmentList files={message.attachments} only="files" />}
          onPin={
            allowPins && (content || message.attachments?.length) && (!message.status || message.status === 'done')
              ? (input) => window.aelion.pinChat({ ...input, botId: message.botId })
              : undefined
          }
        >
          {message.reply && <MessageQuote reply={message.reply} />}
          {answer ? (
            <QuestionAnswerMessage answer={answer} />
          ) : content ? (
            message.role === 'assistant' ? (
              <div className="markdown">
                <MentionContent content={content} mentions={presentation.mentions} markdown pins={pins} />
              </div>
            ) : (
              <>
                <MentionContent content={content} mentions={presentation.mentions} />
                {/* Keeps the last line of text clear of the time in the bubble's corner. */}
                {clock && <span className="bubble-time-gap" aria-hidden="true" />}
              </>
            )
          ) : message.attachments?.length ? null : (
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          )}
          {bare && <AttachmentList files={message.attachments} />}
          {clock && (
            <time className="bubble-time" dateTime={message.time}>
              {clock}
            </time>
          )}
        </MessageActions>
      </div>
    </>
  );
}
