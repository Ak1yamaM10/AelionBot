export class TemporarilyUnavailableTool extends Error {
  readonly code = 'TOOL_TEMPORARILY_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'TemporarilyUnavailableTool';
  }
}

export function reactionRestriction(name: string, duplicateReaction = false) {
  if (duplicateReaction && name === 'chat_pin')
    return '本轮已经存在相同表态，请用文字回应用户，不要继续调用 chat_pin。';
}

export function reactionRestrictionContext(duplicateReaction: boolean) {
  return duplicateReaction
    ? '当前工具执行限制（工具定义不代表本轮允许执行，调用前仍由应用校验）：\nchat_pin：本轮已有相同表态，请用文字回应。'
    : '';
}
