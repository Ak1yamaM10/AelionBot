import { createContext, useContext, useEffect, useMemo } from 'react';
import type { PreviewMarkRef } from '../../shared/preview/preview-annotations';
import { pinReplies } from '../../shared/preview/pin-replies';
import type { AttachmentScope } from '../../shared/types/attachment-types';
import type { PinStatus } from '../../shared/types/preview-editor-types';
import { usePreviewWorkbench } from './PreviewWorkbench';

/** A pin as a Bot's reply refers to it: its number, and what the reply said happened to it. */
export interface PinRef {
  id: string;
  n: number;
  status?: PinStatus;
}
export interface PinThread {
  /** The pins each Bot reply can refer to, by message ID. */
  refs: Map<string, PinRef[]>;
  open: (id: string) => void;
}
export interface ThreadMessage {
  id: string;
  content: string;
  fromUser: boolean;
  previewMarks?: PreviewMarkRef[];
}
/**
 * Groups replies under the comment message they answer. Each comment message starts a thread that runs until the
 * next one; the latest thread's pins get a state for the preview: what the reply said, or working while the Bot runs.
 */
export function pinThreads(messages: ThreadMessage[], running: boolean) {
  const refs = new Map<string, PinRef[]>();
  let latest: Record<string, { status: PinStatus; reply?: string }> = {},
    marks: PreviewMarkRef[] | undefined,
    answers: ThreadMessage[] = [];
  const close = (last: boolean) => {
    if (!marks) return;
    const replies = pinReplies(
      marks,
      answers.map((answer) => answer.content),
    );
    const list = marks.map((mark) => ({ id: mark.id, n: mark.n, status: replies.get(mark.id)?.status }));
    for (const answer of answers) refs.set(answer.id, list);
    if (last)
      latest = Object.fromEntries(
        marks.map((mark) => [mark.id, replies.get(mark.id) || { status: running ? 'working' : 'sent' }]),
      );
  };
  for (const message of messages) {
    if (message.fromUser && message.previewMarks?.length) {
      close(false);
      marks = message.previewMarks;
      answers = [];
    } else if (!message.fromUser && marks) answers.push(message);
  }
  close(true);
  return { refs, latest };
}
export const PinThreadContext = createContext<PinThread | undefined>(undefined);
/** The pins a message can refer to, with a way to open one in the preview. */
export function usePinRefs(messageId: string) {
  const thread = useContext(PinThreadContext),
    refs = thread?.refs.get(messageId);
  return useMemo(() => (thread && refs ? { refs, open: thread.open } : undefined), [thread, refs]);
}
/** Follows a conversation's comment threads and keeps the open preview's pins in step with the replies. */
export function usePinThread(messages: ThreadMessage[], running: boolean, scope: AttachmentScope): PinThread {
  const workbench = usePreviewWorkbench(),
    info = workbench?.info,
    shown = Boolean(info && info.scope?.kind === scope.kind && info.scope.id === scope.id);
  const { refs, latest } = useMemo(
    () =>
      messages.some((message) => message.previewMarks?.length)
        ? pinThreads(messages, running)
        : { refs: new Map<string, PinRef[]>(), latest: {} },
    [messages, running],
  );
  const key = JSON.stringify(latest);
  useEffect(() => {
    if (shown && key !== '{}') workbench?.annotations?.status(latest);
  }, [key, shown, info?.itemId, workbench?.annotations]);
  return useMemo(() => ({ refs, open: (id: string) => workbench?.annotations?.select(id) }), [refs, workbench]);
}
