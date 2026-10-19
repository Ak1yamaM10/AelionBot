import type { ModelRequestStatus } from '../../shared/types/model-request-status';
import { useI18n } from '../i18n';

/**
 * The live output speed beside the context ring, while the model streams. It is estimated in the main process from
 * everything the model generates, reply text, reasoning and tool arguments alike, so a step that only thinks or
 * writes a file still shows a speed. The context panel shows the exact value from provider usage afterwards.
 */
export function LiveTps({ request, running }: { request?: ModelRequestStatus; running: boolean }) {
  const { t, language } = useI18n();
  if (!running || request?.phase !== 'streaming' || !request.outputTokens) return null;
  const first = Date.parse(request.firstOutputAt || ''),
    last = Date.parse(request.lastOutputAt || '');
  // A single non-streaming chunk arrives at once; wait for a real stream before showing a speed.
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 200) return null;
  const tps = request.outputTokens / ((last - first) / 1000);
  if (!Number.isFinite(tps) || tps <= 0) return null;
  const value = new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(tps);
  return (
    <span
      className="composer-live-tps"
      title={t('实时估算：模型当前的输出速度，含思考和工具参数；结束后以实际用量为准')}
      aria-label={t('实时输出速度约 {tps} Token 每秒', { tps: value })}
    >
      {value}
      <small>tok/s</small>
    </span>
  );
}
