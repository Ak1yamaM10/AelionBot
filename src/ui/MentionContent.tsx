import React, { memo, useMemo } from 'react';
import { defaultUrlTransform } from 'react-markdown';
import type { BotMention } from '../../shared/types/core';
import { mentionMarkdown, validMentions } from '../../shared/chat/mentions';
import Markdown from '../chat/MessageMarkdown';
import { MessageLink } from '../chat/MessageLink';
import { Avatar } from './Avatar';
import { pinReferenceMarkdown } from '../../shared/preview/pin-replies';
import type { PinRef } from '../preview/pin-thread';
import { useI18n } from '../i18n';
import './pin-ref.css';

function MentionTag({ mention }: { mention: BotMention }) {
  return (
    <span className="bot-mention" data-bot-id={mention.id} title={`${mention.name} · ${mention.id.slice(0, 8)}`}>
      <Avatar bot={mention} size={16} />@{mention.name}
    </span>
  );
}
/** Pins a Bot reply can refer to as #n, shown as chips that open the pin in the preview. */
interface MessagePins {
  refs: PinRef[];
  open: (id: string) => void;
}
function PinReference({ pin, open }: { pin: PinRef; open: (id: string) => void }) {
  const { t } = useI18n(),
    state = pin.status === 'done' ? t('已改') : pin.status === 'kept' ? t('没改') : t('已发送');
  return (
    <button
      type="button"
      className="pin-ref"
      data-status={pin.status || 'sent'}
      title={t('评论 {n}', { n: pin.n }) + ' · ' + state}
      onClick={() => open(pin.id)}
    >
      <i aria-hidden="true" />#{pin.n}
    </button>
  );
}
type MentionContentProps = { content: string; mentions?: BotMention[]; markdown?: boolean; pins?: MessagePins };
// Live replies and display copies carry equal mentions in new arrays. Mentions are a few small objects, so compare
// their text; the content they annotate is compared as a string, and unchanged text is not parsed again.
export const MentionContent = memo(
  MentionContentView,
  (a: MentionContentProps, b: MentionContentProps) =>
    a.content === b.content &&
    a.markdown === b.markdown &&
    (a.pins === b.pins || JSON.stringify(a.pins?.refs) === JSON.stringify(b.pins?.refs)) &&
    (a.mentions === b.mentions || JSON.stringify(a.mentions || []) === JSON.stringify(b.mentions || [])),
);
function MentionContentView({ content, mentions = [], markdown = false, pins }: MentionContentProps) {
  const prepared = useMemo(
    () => (markdown && mentions.length ? mentionMarkdown(content, mentions) : undefined),
    [content, JSON.stringify(mentions), markdown],
  );
  const pinKey = JSON.stringify(pins?.refs || []),
    source = useMemo(
      () =>
        pins?.refs.length
          ? pinReferenceMarkdown(prepared?.markdown || content, new Set(pins.refs.map((pin) => pin.n)))
          : prepared?.markdown || content,
      [prepared, content, pinKey],
    );
  if (markdown)
    return (
      <Markdown
        urlTransform={(url) =>
          prepared?.links.has(url) || url.startsWith('aelion-pin:') ? url : defaultUrlTransform(url)
        }
        components={{
          a: ({ href, children, node: _node, ...props }) => {
            const pin =
              pins && href?.startsWith('aelion-pin:')
                ? pins.refs.find((item) => item.n === Number(href.slice('aelion-pin:'.length)))
                : undefined;
            if (pin && pins) return <PinReference pin={pin} open={pins.open} />;
            const mention = href ? prepared?.links.get(href) : undefined;
            return mention ? (
              <MentionTag mention={mention} />
            ) : (
              <MessageLink href={href} {...props}>
                {children}
              </MessageLink>
            );
          },
        }}
      >
        {source}
      </Markdown>
    );
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const mention of validMentions(content, mentions)) {
    parts.push(
      content.slice(at, mention.start),
      <MentionTag key={`${mention.id}-${mention.start}`} mention={mention} />,
    );
    at = mention.end;
  }
  parts.push(content.slice(at));
  return <>{parts}</>;
}
