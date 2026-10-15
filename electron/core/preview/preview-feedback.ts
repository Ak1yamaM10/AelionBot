import { validateDomEdits } from '../../../shared/preview/preview-dom-edits';
import { pinNumber, validateAnnotations } from '../../../shared/preview/preview-annotations';
import { ATTACHMENT_LIMITS, type Attachment, type AttachmentScope } from '../../../shared/types/attachment-types';
import { previewFeedbackMessage, type PreviewFeedbackInput } from '../../../shared/preview/preview-feedback';
import { AppError } from '../../../shared/errors';
/** A canvas can discuss only files from its selected design task. */
export function designFeedbackFile(input: PreviewFeedbackInput, session: { botId: string; workspacePath: string }) {
  const source = input.file.path;
  if (!source) return undefined;
  const prefix = '/work/' + session.botId + '/';
  if (!source.startsWith(prefix)) throw new AppError('preview.feedback_file_outside', '反馈文件不属于当前设计任务');
  const path = source.slice(prefix.length);
  if (
    !path.startsWith(session.workspacePath + '/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes(':'))
  )
    throw new AppError('preview.feedback_file_outside', '反馈文件不属于当前设计任务');
  return path;
}
interface Receipt {
  sent: true;
  attachmentId: string;
}
/** At most this many pins get a close-up image of their own. */
const CLOSE_UPS = 6;
interface Entry {
  key: string;
  attachment?: Attachment;
  changes?: Attachment;
  closeUps?: Array<{ id: string; file: Attachment }>;
  promise?: Promise<Receipt>;
  receipt?: Receipt;
}
export class PreviewFeedbackService {
  private entries = new Map<string, Entry>();
  constructor(
    private ops: {
      validate: (scope: AttachmentScope) => void;
      capture: (input: PreviewFeedbackInput) => Promise<Buffer>;
      /** A close-up image per pin; pins it cannot show are left out. */
      closeUps?: (input: PreviewFeedbackInput, ids: string[]) => Promise<Array<{ id: string; bytes: Buffer }>>;
      attach: (scope: AttachmentScope, name: string, bytes: Buffer) => Attachment;
      discard: (scope: AttachmentScope, id: string) => void;
      send: (
        scope: AttachmentScope,
        text: string,
        attachmentId: string,
        prompt: string,
        input?: PreviewFeedbackInput,
      ) => void;
      delivered: (scope: AttachmentScope, attachmentId: string) => boolean;
    },
  ) {}
  send(input: PreviewFeedbackInput): Promise<Receipt> {
    if (!input || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.requestId))
      return Promise.reject(Error('反馈请求无效'));
    if (input.edits) validateDomEdits(input.edits);
    if (input.annotations) validateAnnotations(input.annotations);
    if (
      input.attachmentIds &&
      (!Array.isArray(input.attachmentIds) ||
        input.attachmentIds.length > (input.edits?.length ? 8 : 9) ||
        input.attachmentIds.some((id) => typeof id !== 'string' || id.length > 100))
    )
      return Promise.reject(Error('预览反馈的附件数量过多或无效'));
    const text = previewFeedbackMessage(input);
    this.ops.validate(input.scope);
    const key = JSON.stringify(input),
      previous = this.entries.get(input.requestId);
    if (previous && previous.key !== key)
      return Promise.reject(new AppError('preview.feedback_changed', '反馈请求已变化，请重新发送'));
    if (previous?.receipt) return Promise.resolve(previous.receipt);
    if (previous?.promise) return previous.promise;
    if (!previous && this.entries.size >= 64) {
      const removable = [...this.entries].find(([, entry]) => !entry.promise);
      if (!removable) return Promise.reject(Error('请等待当前反馈发送完成'));
      this.entries.delete(removable[0]);
    }
    const entry = previous || { key };
    this.entries.set(input.requestId, entry);
    const promise = (async () => {
      try {
        if (!entry.attachment) {
          const bytes = await this.ops.capture(input);
          if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw Error('截图为空或超过 15 MB，请调整窗口后重试');
          this.ops.validate(input.scope);
          entry.attachment = this.ops.attach(input.scope, 'preview-' + input.requestId.slice(0, 8) + '.png', bytes);
        }
        if (!entry.closeUps) {
          // Within the message's attachment limit, after the screenshot, the person's files and an edit manifest.
          const room = ATTACHMENT_LIMITS.count - 1 - (input.attachmentIds?.length || 0) - (input.edits?.length ? 1 : 0),
            ids = (input.annotations || []).slice(0, Math.max(0, Math.min(CLOSE_UPS, room))).map((mark) => mark.id),
            shots = ids.length && this.ops.closeUps ? await this.ops.closeUps(input, ids).catch(() => []) : [];
          entry.closeUps = [];
          for (const shot of shots) {
            const index = (input.annotations || []).findIndex((mark) => mark.id === shot.id);
            if (index < 0 || !shot.bytes.length || shot.bytes.length > 8 * 1024 * 1024) continue;
            const n = pinNumber(input.annotations![index], index);
            entry.closeUps.push({
              id: shot.id,
              file: this.ops.attach(
                input.scope,
                'preview-' + input.requestId.slice(0, 8) + '-' + n + '.png',
                shot.bytes,
              ),
            });
          }
        }
        if (input.edits?.length && !entry.changes)
          entry.changes = this.ops.attach(
            input.scope,
            'preview-changes-' + input.requestId.slice(0, 8) + '.json',
            Buffer.from(JSON.stringify({ version: 1, source: input.file, edits: input.edits }, null, 2)),
          );
        if (!this.ops.delivered(input.scope, entry.attachment.id))
          this.ops.send(
            input.scope,
            entry.closeUps.length
              ? previewFeedbackMessage(input, new Map(entry.closeUps.map((shot) => [shot.id, shot.file.name])))
              : text,
            entry.attachment.id,
            input.text.trim(),
            {
              ...input,
              attachmentIds: [
                ...(input.attachmentIds || []),
                ...(entry.changes ? [entry.changes.id] : []),
                ...entry.closeUps.map((shot) => shot.file.id),
              ],
            },
          );
        return (entry.receipt = { sent: true, attachmentId: entry.attachment.id });
      } catch (error) {
        if (entry.attachment && this.ops.delivered(input.scope, entry.attachment.id))
          return (entry.receipt = { sent: true, attachmentId: entry.attachment.id });
        if (entry.attachment) {
          try {
            this.ops.discard(input.scope, entry.attachment.id);
          } catch {}
          entry.attachment = undefined;
        }
        if (entry.changes) {
          try {
            this.ops.discard(input.scope, entry.changes.id);
          } catch {}
          entry.changes = undefined;
        }
        for (const shot of entry.closeUps || [])
          try {
            this.ops.discard(input.scope, shot.file.id);
          } catch {}
        entry.closeUps = undefined;
        throw error;
      }
    })();
    entry.promise = promise;
    void promise
      .finally(() => {
        entry.promise = undefined;
      })
      .catch(() => {});
    return promise;
  }
}
