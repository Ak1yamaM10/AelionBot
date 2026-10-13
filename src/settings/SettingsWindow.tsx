import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { UserProfile } from '../../shared/chat/user-profile';
import { Icon } from '../ui/Icon';
import { Emblem } from '../ui/Emblem';
import { useI18n } from '../i18n';

export type SettingsTab =
  'appearance' | 'profile' | 'runtime' | 'model' | 'design' | 'usage' | 'memory' | 'computer' | 'permissions' | 'about';
type Page = { id: SettingsTab; label: string; icon: string; tone: string };
/**
 * The pages, in the groups the rail shows them in. Each page has a color, taken from the file kinds
 * (file-cards.css), so its tile in the rail and on the page itself are recognizable at a glance.
 */
const groups: ReadonlyArray<ReadonlyArray<Page>> = [
  [{ id: 'appearance', label: '外观', icon: 'appearance', tone: '#8871c5' }],
  [
    { id: 'model', label: '模型', icon: 'layers', tone: '#5888ca' },
    { id: 'memory', label: '记忆', icon: 'memory', tone: '#b18b4f' },
    { id: 'design', label: '设计', icon: 'palette', tone: '#b575aa' },
  ],
  [
    { id: 'runtime', label: '运行', icon: 'sliders', tone: '#529dab' },
    { id: 'computer', label: '电脑', icon: 'computer', tone: '#727fc1' },
    { id: 'permissions', label: '权限', icon: 'shield', tone: '#d3636a' },
  ],
  [
    { id: 'usage', label: '用量', icon: 'chart', tone: '#4a9b7e' },
    { id: 'about', label: '关于', icon: 'info', tone: '#85818e' },
  ],
];
const profilePage: Page = { id: 'profile', label: '个人资料', icon: 'user', tone: '#7a5c9e' };
const tone = (color: string) => ({ '--tile': color }) as CSSProperties;

/** Hue of the accent, in the emblem's color space: your emblem is the purple your own bubbles are. */
const YOUR_HUE = 305;
/** Your emblem, drawn from the first letter of what Bots call you, so it holds still while you type the rest. */
export function ProfileEmblem({ name, size = 36 }: { name?: string; size?: number }) {
  return <Emblem seed={[...(name?.trim() || '')][0]?.toLocaleUpperCase() || ''} size={size} round hue={YOUR_HUE} />;
}

export function SettingsWindow({
  tab,
  profile,
  onTabChange,
  onClose,
  children,
}: {
  tab: SettingsTab;
  profile?: UserProfile;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [tab]);
  const page = tab === 'profile' ? profilePage : groups.flat().find((item) => item.id === tab) || profilePage;
  return (
    <>
      <nav className="settings-rail" aria-label={t('设置分类')}>
        <button
          type="button"
          className={`settings-me ${tab === 'profile' ? 'active' : ''}`}
          aria-current={tab === 'profile' ? 'page' : undefined}
          onClick={() => onTabChange('profile')}
        >
          <ProfileEmblem name={profile?.displayName} size={36} />
          <span className="settings-me-copy">
            <strong>{profile?.displayName.trim() || t('个人资料')}</strong>
            {profile?.displayName.trim() && profile.role.trim() && <small>{profile.role.trim()}</small>}
          </span>
        </button>
        {groups.map((group, index) => (
          <div className="settings-nav-group" key={index}>
            {group.map((item) => (
              <button
                key={item.id}
                type="button"
                title={t(item.label)}
                className={`settings-nav-item ${tab === item.id ? 'active' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                style={tone(item.tone)}
                onClick={() => onTabChange(item.id)}
              >
                <span className="settings-tile" aria-hidden="true">
                  <Icon name={item.icon} size={14} />
                </span>
                <span className="settings-nav-label">{t(item.label)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className={`settings-pane settings-pane-${tab}`}>
        <header className="settings-heading" style={tone(page.tone)}>
          <span className="settings-tile is-large" aria-hidden="true">
            <Icon name={page.icon} size={18} />
          </span>
          <h2>{t(page.label)}</h2>
        </header>
        <button className="settings-close icon-button" aria-label={t('关闭对话框')} onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        <div className={`settings-body settings-page-${tab}`} ref={content}>
          {children}
        </div>
      </div>
    </>
  );
}

/** A labelled group of settings; `aside` sits at the end of the label line (a count, a small action). */
export function SettingsSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SettingsEmpty({
  icon = 'bot',
  title,
  description,
}: {
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="settings-empty settings-empty-state">
      <span className="settings-empty-symbol" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}
