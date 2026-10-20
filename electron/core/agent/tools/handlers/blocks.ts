import { randomUUID } from 'node:crypto';
import { blockMarker, createMessageBlock } from '../../../../../shared/chat/message-blocks';
import { AppError } from '../../../../../shared/errors';
import type { ToolHandler } from '../context';

export const MESSAGE_BLOCK_HANDLERS: Record<string, ToolHandler> = {
  message_block: ({ bot, args, runId, deps }) => {
    const run = deps.store.data.runs.find((item) => item.id === runId && item.botId === bot.id);
    if (!run) throw new AppError('block.run_missing', '找不到这条回复');
    const blocks = (run.blocks ||= []);
    if (blocks.length >= 4) throw new AppError('block.limit', '一条回答最多 4 个块');
    const block = createMessageBlock(args, randomUUID(), new Date().toISOString());
    blocks.push(block);
    deps.store.save();
    deps.changed();
    return { saved: true, id: block.id, type: block.type, marker: blockMarker(block.id) };
  },
};
