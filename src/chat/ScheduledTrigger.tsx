import { useLayoutEffect, useRef, useState } from 'react';
import { clockTime } from './conversation-time';
import { Icon } from '../ui/Icon';
import { useI18n } from '../i18n';
import './scheduled-trigger.css';

/**
 * A scheduled task firing in a conversation: the task's name and when it ran, with the instruction it sent folded to
 * two lines. The caller wraps it in `.scheduled-trigger`, which carries the message id.
 */
export function ScheduledTriggerCard({ title, content, time }: { title: string; content: string; time: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [long, setLong] = useState(false);
  const prompt = useRef<HTMLParagraphElement>(null);
  // Only a folded instruction can tell whether it has more to show.
  useLayoutEffect(() => {
    const element = prompt.current;
    if (!element || open) return;
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content, open]);
  const clock = clockTime(time);
  return (
    <article className={`scheduled-card ${open ? 'is-open' : ''}`}>
      <header>
        <span className="scheduled-card-icon" aria-hidden="true">
          <Icon name="clock" size={16} />
        </span>
        <span className="scheduled-card-heading">
          <strong>{title}</strong>
          <small>
            {t('定时任务')}
            {clock && (
              <>
                {' · '}
                <time dateTime={time}>{clock}</time>
              </>
            )}
          </small>
        </span>
      </header>
      {content && (
        <p ref={prompt} className="scheduled-card-prompt">
          {content}
        </p>
      )}
      {(long || open) && (
        <button
          type="button"
          className="scheduled-card-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('收起') : t('展开全文')}
          <Icon name="down" size={12} />
        </button>
      )}
    </article>
  );
}
