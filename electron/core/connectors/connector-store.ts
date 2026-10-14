// connectors.json in the data directory: connector settings, people allowed in, and per-connector state such as a
// long-poll cursor. Credentials are stored encrypted with the system key store, like model API keys.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ConnectorPairing,
  ConnectorPerson,
  ConnectorPlatform,
  ConnectorView,
} from '../../../shared/types/connector-types';
import type { HostPermissionMode } from '../../../shared/types/permission-types';
import { atomicJson } from '../storage/store';

/** A person and the chat that reaches them, which may differ from their ID (a Feishu chat ID). */
interface StoredPerson extends ConnectorPerson {
  chatId?: string;
}
export interface StoredConnector {
  id: string;
  platform: ConnectorPlatform;
  botId: string;
  enabled: boolean;
  permissionMode: HostPermissionMode;
  owner?: StoredPerson;
  allowed: StoredPerson[];
  pairings: Array<ConnectorPairing & { chatId: string }>;
  account: string;
  /** Encrypted JSON of the platform credentials. */
  secret: string;
  createdAt: string;
  lastMessageAt?: string;
  state?: Record<string, string>;
  /** Recent platform message IDs, so a redelivery after a restart is not handled twice. */
  seen?: string[];
}
interface ConnectorFile {
  version: 1;
  keepRunning: boolean;
  connectors: StoredConnector[];
}
export interface SecretCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
}
const SEEN_KEPT = 300;

export class ConnectorStore {
  readonly file: string;
  data: ConnectorFile;
  constructor(
    dataDir: string,
    private codec: SecretCodec,
  ) {
    this.file = join(dataDir, 'connectors.json');
    let saved: Partial<ConnectorFile> = {};
    try {
      if (existsSync(this.file)) saved = JSON.parse(readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      /* A damaged file starts empty rather than blocking the app; the old file is replaced on the next save. */
    }
    this.data = {
      version: 1,
      keepRunning: saved.keepRunning !== false,
      connectors: Array.isArray(saved.connectors)
        ? saved.connectors
            .filter((item) => item && typeof item.id === 'string' && typeof item.secret === 'string')
            .map((item) => ({ ...item, allowed: item.allowed || [], pairings: item.pairings || [] }))
        : [],
    };
  }
  save() {
    atomicJson(this.file, this.data);
  }
  get(id: string) {
    return this.data.connectors.find((item) => item.id === id);
  }
  credentials<T>(connector: StoredConnector): T {
    return JSON.parse(this.codec.decrypt(connector.secret)) as T;
  }
  setCredentials(connector: StoredConnector, value: object) {
    connector.secret = this.codec.encrypt(JSON.stringify(value));
  }
  encrypt(value: object) {
    return this.codec.encrypt(JSON.stringify(value));
  }
  /** Records a message ID; false when it was handled before. */
  remember(connector: StoredConnector, messageId: string) {
    const seen = (connector.seen ||= []);
    if (seen.includes(messageId)) return false;
    seen.push(messageId);
    if (seen.length > SEEN_KEPT) seen.splice(0, seen.length - SEEN_KEPT);
    return true;
  }
}

const personView = ({ id, name }: StoredPerson): ConnectorPerson => ({ id, ...(name ? { name } : {}) });

export function connectorView(
  connector: StoredConnector,
  live: Pick<ConnectorView, 'status' | 'issue'>,
): ConnectorView {
  return {
    id: connector.id,
    platform: connector.platform,
    botId: connector.botId,
    enabled: connector.enabled,
    permissionMode: connector.permissionMode,
    status: connector.enabled ? live.status : 'disabled',
    ...(connector.enabled && live.issue ? { issue: live.issue } : {}),
    ...(connector.owner ? { owner: personView(connector.owner) } : {}),
    allowed: connector.allowed.map(personView),
    pairings: connector.pairings.map(({ id, name, code, requestedAt }) => ({
      id,
      ...(name ? { name } : {}),
      code,
      requestedAt,
    })),
    account: connector.account,
    createdAt: connector.createdAt,
    ...(connector.lastMessageAt ? { lastMessageAt: connector.lastMessageAt } : {}),
  };
}
