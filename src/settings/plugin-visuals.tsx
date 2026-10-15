import type { Bot, McpServerView, Skill } from '../../shared/types/core';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { AppLogo } from './AppLogo';

// Bundled skills, by folder name, get an icon for what they do; skills from elsewhere share one.
const SKILL_ICONS: Record<string, string> = {
  'code-development': 'code',
  'data-analysis': 'chart',
  'document-writing': 'file',
  'pdf-workbench': 'pdf',
  'presentation-design': 'slides',
  'spreadsheet-workbench': 'table',
  'web-research': 'globe',
  'web-ui-design': 'palette',
  'verified-files': 'check',
};
function skillFolder(skill: Skill) {
  const parts = (skill.source?.path || '').split(/[\\/]/);
  return parts[parts.length - 2] || '';
}
export function PluginIcon({
  skill,
  server,
  owner,
  size = 30,
}: {
  skill?: Skill;
  server?: McpServerView;
  owner?: Bot;
  size?: number;
}) {
  const glyph = Math.round(size * 0.53);
  if (server?.app)
    return (
      <span className="connector-mark plugin-app-mark" style={{ width: size, height: size }}>
        <AppLogo app={server.app} size={Math.round(size * 0.6)} />
      </span>
    );
  if (skill?.botId && owner)
    return (
      <span className="plugin-icon is-bot" style={{ width: size, height: size }}>
        <Avatar bot={owner} size={Math.round(size * 0.74)} />
      </span>
    );
  const name = skill
    ? skill.source?.scope === 'builtin'
      ? SKILL_ICONS[skillFolder(skill)] || SKILL_ICONS[skill.id] || 'book'
      : 'sparkle'
    : server?.transport === 'stdio'
      ? 'terminal'
      : server?.transport === 'unsupported'
        ? 'plugin'
        : 'cloud';
  return (
    <span className="plugin-icon" style={{ width: size, height: size }}>
      <Icon name={name} size={glyph} />
    </span>
  );
}
export function mcpStatusText(server: McpServerView) {
  if (server.login === 'signing-in') return '登录中';
  if (server.login === 'signed-out' && server.status !== 'needs-config' && server.status !== 'disabled')
    return '未登录';
  return server.status === 'connected'
    ? '已连接'
    : server.status === 'connecting'
      ? '连接中'
      : server.status === 'needs-config'
        ? '需要配置'
        : server.status === 'error'
          ? '连接失败'
          : server.enabled
            ? '等待使用'
            : '未启用';
}
type Translate = (key: string, values?: Record<string, string | number>) => string;
/** "3 分钟前", "昨天", "10月3日": when something last happened, at the precision a glance needs. */
export function sinceText(iso: string, t: Translate, language: string, now = Date.now()) {
  const time = new Date(iso),
    minutes = Math.max(0, Math.floor((now - time.getTime()) / 60000));
  if (minutes < 1) return t('刚刚');
  if (minutes < 60) return t('{count} 分钟前', { count: minutes });
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((today.getTime() - time.getTime()) / 86400000);
  if (days <= 0) return t('{count} 小时前', { count: Math.floor(minutes / 60) });
  if (days === 1) return t('昨天');
  if (days < 7) return t('{count} 天前', { count: days });
  return time.toLocaleDateString(language, { month: 'short', day: 'numeric' });
}
