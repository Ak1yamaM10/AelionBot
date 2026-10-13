import type { Snapshot } from '../../shared/types/core';
import { SetupProgress } from '../computer/ComputerSetup';
import { computerSetupActionLabel, computerSetupState, computerStatusTitle } from '../computer/computer-setup-state';
import { HostWorkspaceSettings } from '../settings/HostWorkspaceSettings';
import { SettingsSection } from '../settings/SettingsWindow';
import { VmStorageSettings } from '../settings/VmStorageSettings';
import { bytes } from '../ui/format';
import { Icon } from '../ui/Icon';
import { useI18n } from '../i18n';

/** The Computer settings tab: the work computer and its state, its storage, upkeep, and your own default folder. */
export function ComputerSettings({
  state,
  busy,
  anyRunning,
  vmReady,
  desktopAvailable,
  act,
  onNotify,
  onSetup,
  onTerminal,
}: {
  state: Snapshot;
  busy: boolean;
  anyRunning: boolean;
  vmReady: boolean;
  desktopAvailable: boolean;
  act: (operation: () => Promise<unknown>) => Promise<void>;
  onNotify: (message: string) => void;
  onSetup: () => void;
  onTerminal: () => void;
}) {
  const { t } = useI18n();
  const vm = state.vm,
    view = computerSetupState(vm),
    ready = desktopAvailable || view.kind === 'ready',
    tone = ready ? 'is-ready' : view.working ? 'is-working' : view.kind === 'error' ? 'is-error' : '',
    detail = view.working || ready ? vm.detail : vm.lastError;
  const locked = !vmReady || busy || anyRunning;
  return (
    <>
      <section className="computer-hero" aria-label={t('工作电脑状态')}>
        <div className="computer-hero-main">
          <span className="computer-hero-mark" aria-hidden="true">
            <Icon name="computer" size={26} />
          </span>
          <div className="computer-hero-copy">
            <strong>{t('Linux 工作电脑')}</strong>
            <span className={`computer-state ${tone}`} role="status">
              {view.kind === 'invite' ? t('尚未初始化') : computerStatusTitle(vm)}
            </span>
          </div>
          {!ready && (
            <button className={view.working ? 'secondary-button' : 'primary-button'} onClick={onSetup}>
              {view.working ? t('查看进度') : computerSetupActionLabel(vm)}
            </button>
          )}
        </div>
        {view.working && <SetupProgress vm={vm} />}
        {detail && <p className={`computer-hero-detail ${tone === 'is-error' ? 'is-error' : ''}`}>{detail}</p>}
        <dl className="computer-specs">
          <div>
            <dt>{t('桌面')}</dt>
            <dd>Aelion {t('桌面')} · Linux</dd>
          </div>
          <div>
            <dt>{t('资源')}</dt>
            <dd>4 GB RAM · 4 vCPU</dd>
          </div>
          <div>
            <dt>{t('应用环境')}</dt>
            <dd>{vm.appsReady ? 'Chrome · ' + t('文件管理器') + ' · ' + t('办公套件') : t('需要准备')}</dd>
          </div>
          <div>
            <dt>{t('工作磁盘文件')}</dt>
            <dd>{bytes(vm.diskBytes || 0)}</dd>
          </div>
        </dl>
      </section>
      <VmStorageSettings vm={vm} busy={anyRunning || busy} />
      <SettingsSection title={t('维护')}>
        <div className="settings-card settings-action-list">
          <button disabled={locked} onClick={onTerminal}>
            <Icon name="terminal" size={18} />
            {t('打开工作终端')}
            <Icon name="arrow" size={15} />
          </button>
          <button disabled={locked} onClick={() => act(() => window.aelion.vmAction('restart'))}>
            <Icon name="restart" size={18} />
            {t('重启电脑')}
            <Icon name="arrow" size={15} />
          </button>
          <button disabled={locked || vm.maintenance} onClick={() => act(() => window.aelion.vmAction('repair-tools'))}>
            <Icon name="settings" size={18} />
            {vm.maintenance ? t('正在准备工作环境…') : t('修复工作环境')}
            <Icon name="arrow" size={15} />
          </button>
          <button disabled={locked} onClick={() => act(() => window.aelion.vmAction('stop'))}>
            <Icon name="pause" size={18} />
            {t('关闭工作电脑')}
            <Icon name="arrow" size={15} />
          </button>
          <button onClick={() => act(() => window.aelion.openData())}>
            <Icon name="folder" size={18} />
            {t('打开本地数据目录')}
            <Icon name="arrow" size={15} />
          </button>
        </div>
      </SettingsSection>
      {state.hostWorkspace && (
        <HostWorkspaceSettings
          settings={state.hostWorkspace}
          busy={busy || anyRunning}
          act={act}
          onSaved={() => onNotify(t('本机工作目录已保存'))}
        />
      )}
    </>
  );
}
