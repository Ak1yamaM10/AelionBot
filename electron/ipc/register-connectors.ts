import type { IpcContext } from './context';
import { AppError } from '../../shared/errors';

export function registerConnectors(ctx: IpcContext) {
  const { handle } = ctx;
  const connectors = () => {
    if (!ctx.connectors) throw new AppError('connector.unavailable', '连接器尚未就绪');
    return ctx.connectors;
  };
  handle('addConnector', (input) => connectors().add(input));
  handle('startConnectorSetup', (input) => connectors().startSetup(input));
  handle('answerConnectorSetup', (input) => connectors().answerSetup(input));
  handle('cancelConnectorSetup', (id) => connectors().cancelSetup(id));
  handle('updateConnector', (input) => connectors().update(input));
  handle('removeConnector', (id) => connectors().remove(id));
  handle('reconnectConnector', (id) => connectors().reconnect(id));
  handle('decideConnectorPairing', (input) => connectors().decidePairing(input));
  handle('setConnectorsKeepRunning', (enabled) => connectors().setKeepRunning(enabled));
}
