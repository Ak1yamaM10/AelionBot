import { useEffect, useState } from 'react';
import { estimateLiveTokens } from '../../shared/chat/request-metrics';
import { useStreamingReplies } from '../app/streams';
import { useI18n } from '../i18n';

/**
 * The live output speed beside the context ring. It is an estimate from the visible text and disappears with the
 * stream; the context panel shows the exact value from provider usage once the request completes.
 */
export function LiveTps({ botId, sessionId, running }: { botId: string; sessionId?: string; running: boolean }) {
  const { t, language } = useI18n(),
    [now, setNow] = useState(() => Date.now());
  const replies = useStreamingReplies(
    'live-tps:' + botId + ':' + (sessionId || ''),
    (reply) =>
      Boolean(reply.main) &&
      reply.botId === botId &&
      reply.sessionId === sessionId &&
      (!reply.purpose || reply.purpose === 'reply'),
  );
  const reply = replies.filter((item) => item.content).at(-1),
    active = running && Boolean(reply?.content && reply.firstTokenAt && reply.lastTokenAt);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  if (!active || !reply?.firstTokenAt || !reply.lastTokenAt) return null;
  const first = Date.parse(reply.firstTokenAt),
    last = Date.parse(reply.lastTokenAt);
  // A single non-streaming chunk arrives in one update; wait for a real stream before showing a speed.
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 200 || now - first < 300) return null;
  const tokens = estimateLiveTokens(reply.content),
    tps = tokens / Math.max((now - first) / 1000, 0.3);
  if (!Number.isFinite(tps) || tps <= 0) return null;
  const value = new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(tps);
  return (
    <span
      className="composer-live-tps"
      title={t('实时估算：当前可见文字的输出速度；结束后以实际用量为准')}
      aria-label={t('实时输出速度约 {tps} Token 每秒', { tps: value })}
    >
      {value}
      <small>tok/s</small>
    </span>
  );
}
