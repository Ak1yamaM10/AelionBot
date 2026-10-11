// Renders production App components against read-only fictional data. No model or VM connection.
import { createRoot } from 'react-dom/client';
import App from '../../../src/app/App';
import catalog from '../../../assets/design-systems/catalog.json';
import { GROUP_LIMITS } from '../../../shared/types/group-types';
import { computerSetupDismissalKey } from '../../../src/computer/computer-setup-state';
import { initializeAppearance } from '../../../src/app/use-appearance';
import { initializeI18n } from '../../../src/i18n';
import { buildScene, designThumbnail } from './scene';
import '../../../src/styles/style.css';
import '../../../src/settings/settings.css';
import '../../../src/styles/typography.css';
import '../../../src/styles/theme.css';

const params = new URLSearchParams(location.search),
  lang = params.get('lang') || 'zh-CN',
  shot = params.get('shot') || 'workspace',
  theme = params.get('theme') === 'dark' ? 'dark' : 'light';
localStorage.setItem('aelion-language', lang);
localStorage.setItem('aelion-appearance', JSON.stringify({ theme }));
localStorage.removeItem('aelion-design-active');
initializeAppearance();
initializeI18n();

const GiB = 1024 ** 3;
const scene = buildScene(lang, shot, catalog.systems as any[]);
const state: any = {
  platform: 'win32',
  ...scene.state,
  model: { baseUrl: 'https://example.invalid', model: 'large-reasoning', contextTokens: 400000, hasKey: true },
  vm: {
    status: 'stopped',
    detail: scene.text.vmStopped,
    imageVersion: 'example',
    desktopReady: false,
    appsReady: true,
    diskBytes: 5.9 * GiB,
    storage: {
      settings: { limitGiB: 12, reclaimAfterUpdate: true },
      usageBytes: 5.9 * GiB,
      baseBytes: 3.1 * GiB,
      systemBytes: 3.1 * GiB,
      workBytes: 2.2 * GiB,
      otherBytes: 0.6 * GiB,
      paused: false,
      reclaiming: false,
      reclaimPending: false,
      lastReclaimedBytes: 1.1 * GiB,
      lastReclaimedAt: new Date(2026, 9, 11, 22, 10).toISOString(),
    },
  },
  skills: scene.skills,
  artifacts: [],
  computer: { desktops: {} },
  dataDir: 'website-readonly-capture',
  groups: { revision: 0, rooms: scene.rooms, limits: GROUP_LIMITS },
  peers: { revision: 0, threads: scene.threads, exchanges: scene.exchanges },
  hostPermissionModes: {},
  updates: { phase: 'idle', currentVersion: '0.42.2' },
};
localStorage.setItem(computerSetupDismissalKey(state.dataDir, state.vm), 'dismissed');

const noop = async () => {};
const api: Record<string, unknown> = {
  readState: async () => ({ seq: 1, snapshot: structuredClone(state), streams: [] }),
  onEvent: () => () => {},
  games: { inspect: async () => [], create: noop, act: noop, control: noop, read: async () => scene.game },
  readGroup: async (input: { id: string }) =>
    scene.groupThreads[input.id] || { group: scene.rooms[0], messages: [], deliveries: [] },
  readPrivateChat: async () => scene.privateChat,
  previewAttachment: async (id: string) => scene.previews[id] || scene.previews.default,
  readEditableAttachment: async () => ({
    content: scene.previews.default.content,
    revision: '0'.repeat(64),
    bytes: 2048,
  }),
  prepareAttachmentPaste: async () => ({ entries: [], attachments: [] }),
  searchMentionFiles: async () => ({ files: [], truncated: false, workspaceDir: '' }),
  listModels: async () => [],
  listFiles: async () => [],
  listDesignWorkspace: async () => scene.designFiles,
  designThumbnail: async (input: { path: string }) => ({
    path: input.path,
    dataUrl: designThumbnail(scene.text.designTitle),
  }),
  listLibraryFonts: async () => scene.fonts,
  imageProtocols: async () => [],
  hostWorkspaceSettings: async () => ({ workspaceDir: '', defaultWorkspaceDir: '' }),
  usageStatistics: async () => ({}),
};
window.aelion = new Proxy(api, {
  get: (target, key: string) => (key in target ? target[key] : /^on[A-Z]/.test(key) ? () => () => {} : noop),
}) as any;
createRoot(document.getElementById('root')!).render(<App />);
