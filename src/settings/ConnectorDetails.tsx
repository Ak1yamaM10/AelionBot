import { useEffect, useRef, useState } from 'react';
import type { Snapshot, WorkSession } from '../../shared/types/core';
import { CONNECTOR_PLATFORM_NAMES, type ConnectorView } from '../../shared/types/connector-types';
import { Icon } from '../ui/Icon';
import { ipcErrorText } from '../ui/ipc-error';
import { useI18n } from '../i18n';
import { PluginSwitch } from './PluginDetails';
import { ConnectorFields, connectorStatusText } from './AddConnectorDialog';

export function ConnectorDetails({
  state,
  connector,
  onBack,
  onOpenSession,
}: {
  state: Snapshot;
  connector?: ConnectorView;
  onBack: () => void;
  onOpenSession: (session: WorkSession) => void;
}) {
  const { t, language } = useI18n();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [confirmRemove, setConfirmRemove] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), [connector?.id]);
  const run = async (operation: () => Promise<unknown>) => {
    setPending(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(ipcErrorText(e));
    } finally {
      setPending(false);
    }
  };
  if (!connector)
    return (
      <div className="plugin-detail">
        <button className="plugin-back" onClick={onBack}>
          <Icon name="back" size={15} />
          {t('返回插件')}
        </button>
        <p>{t('这个连接器已被删除。')}</p>
      </div>
    );
  const name = t(CONNECTOR_PLATFORM_NAMES[connector.platform]),
    sessions = (state.workSessions || [])
      .filter((session) => session.connector?.connectorId === connector.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    update = (input: Omit<Parameters<typeof window.aelion.updateConnector>[0], 'id'>) =>
      run(() => window.aelion.updateConnector({ id: connector.id, ...input }));
  return (
    <article className="plugin-detail connector-detail">
      <button className="plugin-back" onClick={onBack}>
        <Icon name="back" size={15} />
        {t('返回插件')}
      </button>
      <header className="plugin-detail-heading">
        <span className="plugin-detail-icon">
          <Icon name="message" size={24} />
        </span>
        <div>
          <p>{t('连接器')}</p>
          <h2 ref={heading} tabIndex={-1}>
            {name}
          </h2>
        </div>
        <PluginSwitch
          name={name}
          enabled={connector.enabled}
          disabled={pending}
          onChange={() => void update({ enabled: !connector.enabled })}
        />
      </header>
      <div className="plugin-detail-owner">
        <span className={`plugin-connection ${connector.status}`}>
          <i />
          {t(connectorStatusText(connector.status))}
        </span>
        {connector.platform === 'weixin' && <span className="plugin-shared">{t('实验')}</span>}
      </div>
      {connector.issue && (
        <p className="computer-notice" role="alert">
          {connector.issue}
        </p>
      )}
      <ConnectorFields
        bots={state.bots}
        botId={connector.botId}
        mode={connector.permissionMode}
        disabled={pending}
        onBot={(botId) => void update({ botId })}
        onMode={(permissionMode) => void update({ permissionMode })}
      />
      <dl className="plugin-detail-meta">
        <div>
          <dt>{t('主人')}</dt>
          <dd>{connector.owner ? connector.owner.name || connector.owner.id : t('等待配对')}</dd>
        </div>
        <div>
          <dt>{t('账号')}</dt>
          <dd>{connector.account}</dd>
        </div>
        {connector.lastMessageAt && (
          <div>
            <dt>{t('最近消息')}</dt>
            <dd>{new Date(connector.lastMessageAt).toLocaleString(language)}</dd>
          </div>
        )}
      </dl>
      {connector.pairings.length > 0 && (
        <section className="connector-list" aria-labelledby="connector-pairings">
          <h3 id="connector-pairings">{t('配对请求')}</h3>
          {connector.pairings.map((pairing) => (
            <div key={pairing.code}>
              <span>
                {pairing.name || pairing.id}
                <code>{pairing.code}</code>
              </span>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    window.aelion.decideConnectorPairing({ id: connector.id, code: pairing.code, allow: false }),
                  )
                }
              >
                {t('拒绝')}
              </button>
              <button
                className="primary-button"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    window.aelion.decideConnectorPairing({ id: connector.id, code: pairing.code, allow: true }),
                  )
                }
              >
                {connector.owner ? t('允许') : t('设为主人')}
              </button>
            </div>
          ))}
        </section>
      )}
      {connector.allowed.length > 0 && (
        <section className="connector-list" aria-labelledby="connector-allowed">
          <h3 id="connector-allowed">{t('其他可以使用的人')}</h3>
          {connector.allowed.map((person) => (
            <div key={person.id}>
              <span>{person.name || person.id}</span>
              <button
                className="text-button"
                disabled={pending}
                onClick={() => void update({ removeAllowed: [person.id] })}
              >
                {t('移除')}
              </button>
            </div>
          ))}
        </section>
      )}
      {sessions.length > 0 && (
        <section className="connector-list" aria-labelledby="connector-sessions">
          <h3 id="connector-sessions">{t('会话')}</h3>
          {sessions.map((session) => (
            <div key={session.id}>
              <button className="text-button" onClick={() => onOpenSession(session)}>
                {session.name}
              </button>
              <small>
                {state.bots.find((bot) => bot.id === session.botId)?.name}
                {session.archivedAt ? ' · ' + t('已归档') : ''}
              </small>
            </div>
          ))}
        </section>
      )}
      {error && (
        <p className="computer-notice" role="alert">
          {error}
        </p>
      )}
      <div className="plugin-detail-actions">
        <button
          className="secondary-button"
          disabled={pending || !connector.enabled}
          onClick={() => void run(() => window.aelion.reconnectConnector(connector.id))}
        >
          {t('重新连接')}
        </button>
        {confirmRemove ? (
          <>
            <button className="secondary-button" disabled={pending} onClick={() => setConfirmRemove(false)}>
              {t('取消')}
            </button>
            <button
              className="danger-button"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await window.aelion.removeConnector(connector.id);
                  onBack();
                })
              }
            >
              {t('确认删除')}
            </button>
          </>
        ) : (
          <button className="secondary-button" disabled={pending} onClick={() => setConfirmRemove(true)}>
            {t('删除连接器')}
          </button>
        )}
      </div>
      {confirmRemove && <p className="subtle">{t('删除后不再收发消息，已有的会话会保留在 Bot 下面。')}</p>}
    </article>
  );
}
