import type { HostComputerView } from '../../shared/types/permission-types';
import { SettingsSection } from './SettingsWindow';
import { useI18n } from '../i18n';

/** Computer Use on this computer: the switch that offers it to Bots. Each task still asks before it starts. */
export function HostComputerSettings({
  value,
  busy,
  act,
}: {
  value: HostComputerView;
  busy: boolean;
  act: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('电脑控制')}>
      <div className="settings-card">
        <div className="settings-switch-row">
          <div className="settings-row-copy">
            <span>{t('让 Bot 操作这台电脑上的应用')}</span>
          </div>
          <button
            role="switch"
            aria-label={t('让 Bot 操作这台电脑上的应用')}
            aria-checked={value.enabled}
            className={value.enabled ? 'learning-switch enabled' : 'learning-switch'}
            disabled={busy}
            onClick={() => act(() => window.aelion.setHostComputerEnabled(!value.enabled))}
          >
            <i />
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
