import type { ToolHandler } from '../context';

export const WEB_HANDLERS: Record<string, ToolHandler> = {
  web_read: ({ bot, args, signal, deps }) => deps.web.read(bot.id, args, signal),
};
