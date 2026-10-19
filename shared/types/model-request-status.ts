/** Public transport state only; never provider bodies, prompts or reasoning. */
export interface ModelRequestStatus {
  activity?: 'text' | 'tool' | 'reasoning' | 'response';
  receivedBytes?: number;
  toolArgumentChars?: number;
  /** Estimated output tokens so far (reply, reasoning and tool arguments), for the live speed beside the composer. */
  outputTokens?: number;
  /** When this attempt's first and latest counted output arrived. */
  firstOutputAt?: string;
  lastOutputAt?: string;
  phase: 'waiting' | 'streaming' | 'retrying';
  startedAt: string;
  updatedAt: string;
  attempt: number;
  maxRetries: number;
  reason?: 'rate_limit' | 'timeout' | 'connect_timeout' | 'connection' | 'fallback';
}
