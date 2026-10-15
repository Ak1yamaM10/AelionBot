import { contextBridge, ipcRenderer } from 'electron';
import { FEEDBACK_OVERLAY_KINDS, type FeedbackOverlayKind } from '../../shared/preview/preview-feedback-overlay';
let id = '',
  editVersion = 0;
contextBridge.exposeInMainWorld('feedbackOverlay', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('preview-feedback-overlay:state', (_event, state) => {
      if (id !== state.id) editVersion = state.editVersion || 0;
      id = state.id;
      callback(state);
    });
  },
  act: (kind: FeedbackOverlayKind, text: string) => {
    if (FEEDBACK_OVERLAY_KINDS.includes(kind) && typeof text === 'string' && text.length <= 12000) {
      const version = ++editVersion;
      ipcRenderer.send('preview-feedback-overlay:input', { id, kind, text, editVersion: version });
      return version;
    }
  },
});
