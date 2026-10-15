import { commentsFromAnnotations } from '../../shared/preview/designer-canvas';
import { applyDomEdits } from '../core/preview/html-preview-edits';
import { PreviewFeedbackService, designFeedbackFile } from '../core/preview/preview-feedback';
import { feedbackCaptureRect } from '../../shared/preview/preview-feedback';
import { markRefs } from '../../shared/preview/preview-annotations';
import type { NativeImage } from 'electron';
import type { IpcContext } from './context';

export function registerPreview(ctx: IpcContext) {
  const { handle } = ctx;
  handle('updatePreviewFeedbackOverlay', (input) => ctx.webPreview!.feedback(input));
  handle('patchPreviewHtml', (input) => applyDomEdits(input.content, input.edits));
  handle('acknowledgePreview', (id) => {
    if (typeof id !== 'string' || id.length > 100) throw Error('无效预览 ID');
    ctx.agentPreviews?.acknowledge(id);
  });
  const feedbackDesign = (input?: import('../../shared/preview/preview-feedback').PreviewFeedbackInput) => {
    if (!input?.designSessionId) return undefined;
    const design = ctx.designStore.get(input.designSessionId, undefined, {
        kind: input.scope.kind,
        id: input.scope.id,
      }),
      path = designFeedbackFile(input, design);
    if (path && design.location === 'host') ctx.designerFiles.absolute(design, path);
    return design;
  };
  /** The app window as an image, within ten seconds. */
  const captureWindow = async (): Promise<NativeImage> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const capture = await Promise.race([
      ctx.window!.webContents.capturePage(undefined, { stayHidden: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('预览截图超时，请重试')), 10000);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (capture.isEmpty()) throw Error('未能截取预览画面，请重试');
    return capture;
  };
  const previewFeedback = new PreviewFeedbackService({
    validate: (scope) => {
      ctx.attachments.scope(scope);
      if (scope.kind === 'bot') {
        if (!ctx.store.modelFor(scope.id).model) throw Error('请先为这个 Bot 选择模型');
      } else {
        const room = ctx.store.data.groups.find((room) => room.id === scope.id);
        if (
          !room?.members.some(
            (member) =>
              !member.leftAt &&
              ctx.store.data.bots.some((bot) => bot.id === member.id) &&
              ctx.store.modelFor(member.id).model,
          )
        )
          throw Error('请先为群内 Bot 选择模型');
      }
    },
    capture: async (input) => {
      feedbackDesign(input);
      if (!ctx.window || ctx.window.isDestroyed() || ctx.window.isMinimized() || !ctx.window.isVisible())
        throw Error('请保持预览窗口可见后再发送');
      feedbackCaptureRect(input.rect, input.viewport, input.viewport);
      const webCapture = await ctx.webPreview?.capture(input.rect);
      if (webCapture) return webCapture;
      const capture = await captureWindow();
      let cropped = capture.crop(feedbackCaptureRect(input.rect, input.viewport, capture.getSize()));
      const size = cropped.getSize();
      if (Math.max(size.width, size.height) > 2560)
        cropped = cropped.resize(
          size.width >= size.height ? { width: 2560, quality: 'best' } : { height: 2560, quality: 'best' },
        );
      return cropped.toPNG();
    },
    // A page shows each pin by scrolling to it; a file preview cuts the pins on screen out of the window.
    closeUps: async (input, ids) => {
      const page = await ctx.webPreview?.closeUps(ids);
      if (page) return page;
      const rects = (input.pinRects || []).filter((pin) => ids.includes(pin.id));
      if (!rects.length || !ctx.window || ctx.window.isDestroyed()) return [];
      const image = await captureWindow(),
        pad = 40,
        area = input.rect;
      return rects.flatMap(({ id, rect }) => {
        const x = Math.max(area.x, rect.x - pad),
          y = Math.max(area.y, rect.y - pad),
          box = {
            x,
            y,
            width: Math.min(area.x + area.width, rect.x + rect.width + pad) - x,
            height: Math.min(area.y + area.height, rect.y + rect.height + pad) - y,
          };
        try {
          return [{ id, bytes: image.crop(feedbackCaptureRect(box, input.viewport, image.getSize())).toPNG() }];
        } catch {
          return [];
        }
      });
    },
    attach: (scope, name, bytes) => ctx.attachments.importFiles(scope, [{ name, bytes }])[0],
    discard: (scope, id) => ctx.attachments.discardUnsentDraft(scope, id),
    send: (scope, message, attachmentId, previewPrompt, input) => {
      const design = feedbackDesign(input);
      if (design && input?.annotations?.length)
        ctx.designStore.addComments(
          design.id,
          commentsFromAnnotations(
            input.file?.path || input.file?.url || input.file?.name || '',
            input.text,
            input.annotations,
            design.comments || [],
          ),
        );
      const offset =
          message.indexOf(previewPrompt, message.indexOf('\n') + 1) -
          (input?.text.length || 0) +
          (input?.text.trimStart().length || 0),
        extras = {
          designSessionId: design?.id,
          attachmentIds: [...(input?.attachmentIds || []), attachmentId],
          mentions: input?.mentions?.map((m) => ({ ...m, start: m.start + offset, end: m.end + offset })),
          replyToMessageId: input?.replyToMessageId,
          previewPrompt,
          ...(input?.annotations?.length ? { previewMarks: markRefs(input.annotations) } : {}),
        };
      if (scope.kind === 'bot')
        ctx.chatPins!.send({
          botId: scope.id,
          ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
          message,
          ...extras,
        });
      else ctx.groupChats!.send({ id: scope.id, message, ...extras });
    },
    delivered: (scope, id) =>
      (scope.kind === 'bot'
        ? ctx.store.data.messages.filter((message) => message.botId === scope.id && message.role === 'user')
        : ctx.store.data.groups
            .find((room) => room.id === scope.id)
            ?.messages.filter((message) => message.sender.kind === 'user') || []
      ).some((message) => message.attachments?.some((file) => file.id === id)),
  });
  handle('sendPreviewFeedback', (input) => previewFeedback.send(input));
  handle('focusPreviewFeedback', () => {
    if (ctx.window && !ctx.window.isDestroyed() && ctx.window.isFocused()) ctx.window.webContents.focus();
  });
}
