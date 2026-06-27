import type {ClientRequest, OutgoingMessage} from '@chatwidget/shared';
import {createQueueManager} from './queue';
import {createRateLimiter} from '../core/rateLimit';
import {streamOllamaChat} from './ollama';
import {sendError, type ChatSocket} from '../core/socket';

// Local Ollama, one request at a time.

const RATE_LIMIT = {max: 10, windowMs: 60_000} as const;

export function createLocalRunner() {
  const queue = createQueueManager();
  const limiter = createRateLimiter(RATE_LIMIT.max, RATE_LIMIT.windowMs);

  const handle = (
    ws: ChatSocket,
    request: ClientRequest,
    messages: OutgoingMessage[],
  ) => {
    if (!limiter.take(ws.data.clientIp)) {
      sendError(ws, request.id, 'rate_limit', 'Rate limit exceeded.');
      return;
    }
    queue.enqueue(ws, {...request, messages}, streamOllamaChat);
  };

  const cancel = (ws: ChatSocket, id: string) => queue.cancel(ws, id);

  const closeSocket = (ws: ChatSocket) => queue.removeSocket(ws);

  return {handle, cancel, closeSocket};
}

export type LocalRunner = ReturnType<typeof createLocalRunner>;
