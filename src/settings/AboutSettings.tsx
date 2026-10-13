import { useState } from 'react';
import { version } from '../../package.json';
import type { UpdateState } from '../../shared/types/update-types';
import { FeedbackSettings } from './FeedbackSettings';
import { Avatar } from '../ui/Avatar';
import { bytes } from '../ui/format';
import { useI18n } from '../i18n';
import '../app/updates.css';

const labels = {
  idle: '',
  checking: '正在检查更新…',
  current: '已是最新版本',
  available: '有新版本可用',
  downloading: '正在下载更新…',
  cancelling: '正在取消下载…',
  downloaded: '更新已下载',
  installing: '正在准备安装更新…',
  error: '更新未完成',
  unsupported: '开发模式下不安装更新，请使用发行版。',
};
export function AboutSettings({ update, onNotify }: { update?: UpdateState; onNotify: (text: string) => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false),
    phase = update?.phase || 'idle',
    working = ['checking', 'downloading', 'cancelling', 'installing'].includes(phase);
  const act = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
    } catch (error) {
      onNotify((error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      setPending(false);
    }
  };
  const check = () => void act(() => window.aelion.checkForUpdates());
  return (
    <>
      <section className="about-app" aria-label={t('应用')}>
        <Avatar bot={{ name: 'AelionBot', color: '#9a7ccb' }} size={68} />
        <span className="brand">
          Aelion<span>Bot</span>
        </span>
        <p className="about-version">
          {t('版本')} {update?.currentVersion || version}
        </p>
        {update && (labels[phase] || update.latestVersion) && (
          <div className="about-update-status" role="status">
            {labels[phase] && t(labels[phase])}
            {update.latestVersion && ['available', 'downloading', 'downloaded', 'installing'].includes(phase) && (
              <strong> {update.latestVersion}</strong>
            )}
          </div>
        )}
        {update?.progress && (
          <div className="about-update-progress">
            <div
              className="update-progress"
              role="progressbar"
              aria-label={t('更新下载进度')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(update.progress.percent)}
            >
              <div style={{ width: update.progress.percent + '%' }} />
            </div>
            <div className="update-progress-detail">
              <span>
                {bytes(update.progress.transferred)}
                {update.progress.total > 0 ? ` / ${bytes(update.progress.total)}` : ''}
              </span>
              <span>{Math.round(update.progress.percent)}%</span>
            </div>
          </div>
        )}
        {update?.error && (
          <p className="update-error" role="alert">
            {update.error}
          </p>
        )}
        {update?.manualInstall && (
          <p className="update-note">{t('Mac 预览版尚未公证，更新时请下载新版安装包并替换应用。')}</p>
        )}
        {phase === 'downloaded' && update?.installBlockedReason && (
          <p className="update-note">{update.installBlockedReason}</p>
        )}
        {phase === 'installing' && <p className="update-note">{t('正在保存状态并关闭工作电脑，安装后会重新打开。')}</p>}
        <div className="about-app-actions">
          {update && ['available', 'error'].includes(phase) && update.latestVersion ? (
            <button
              className="primary-button"
              disabled={pending}
              onClick={() =>
                void act(() =>
                  update.manualInstall ? window.aelion.openUpdateRelease() : window.aelion.downloadUpdate(),
                )
              }
            >
              {update.manualInstall ? t('前往下载') : phase === 'error' ? t('重试下载') : t('下载更新')}
            </button>
          ) : phase === 'downloading' ? (
            <button className="secondary-button" onClick={() => void window.aelion.cancelUpdateDownload()}>
              {t('取消下载')}
            </button>
          ) : phase === 'downloaded' && update ? (
            <button
              className="primary-button"
              disabled={pending || Boolean(update.installBlockedReason)}
              onClick={() => void act(() => window.aelion.installUpdate())}
            >
              {t('重启并更新')}
            </button>
          ) : (
            <button
              className="secondary-button"
              disabled={pending || working || phase === 'unsupported'}
              onClick={check}
            >
              {phase === 'checking' ? t('检查中…') : t('检查更新')}
            </button>
          )}
          {update && (
            <button
              className="text-button"
              onClick={() => void act(() => window.aelion.openUpdateRelease())}
              disabled={pending || phase === 'installing'}
            >
              {t('查看 GitHub Release')}
            </button>
          )}
        </div>
        {update && (
          <p className="update-source">
            {t('更新来源：')}
            {update.repository}
          </p>
        )}
      </section>
      <FeedbackSettings onNotify={onNotify} />
    </>
  );
}
