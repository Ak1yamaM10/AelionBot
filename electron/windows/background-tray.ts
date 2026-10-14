// The tray icon: always present while the app runs, and the way back to a window hidden while connectors run.
import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import { CONNECTOR_PLATFORM_NAMES, type ConnectorView } from '../../shared/types/connector-types';

export class BackgroundTray {
  private tray?: Tray;
  constructor(
    private deps: {
      icon: string;
      window: () => BrowserWindow | undefined;
      connectors: () => ConnectorView[];
      translate: (source: string, values?: Record<string, string | number>) => string;
      quit: () => void;
    },
  ) {}
  /** Shows the window again, from the tray or a second launch. */
  open() {
    const window = this.deps.window();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  /** Creates the tray icon on first use and updates its tooltip and menu with the connectors' state. */
  refresh() {
    const t = this.deps.translate;
    if (!this.tray) {
      const image = nativeImage.createFromPath(this.deps.icon);
      this.tray = new Tray(process.platform === 'darwin' ? image.resize({ width: 18, height: 18 }) : image);
      this.tray.on('click', () => this.open());
    }
    const connectors = this.deps.connectors().filter((connector) => connector.enabled),
      connected = connectors.filter((connector) => connector.status === 'connected').length;
    this.tray.setToolTip(
      connectors.length
        ? `AelionBot · ${t('连接器 {connected}/{total} 在线', { connected, total: connectors.length })}`
        : 'AelionBot',
    );
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('打开 AelionBot'), click: () => this.open() },
        ...(connectors.length
          ? [
              { type: 'separator' as const },
              ...connectors.map((connector) => ({
                label: `${t(CONNECTOR_PLATFORM_NAMES[connector.platform])} · ${
                  connector.status === 'connected'
                    ? t('已连接')
                    : connector.status === 'connecting'
                      ? t('连接中')
                      : t('未连接')
                }`,
                enabled: false,
              })),
            ]
          : []),
        { type: 'separator' },
        { label: t('退出'), click: () => this.deps.quit() },
      ]),
    );
  }
  dispose() {
    this.tray?.destroy();
    this.tray = undefined;
  }
}
