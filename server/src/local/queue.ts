import type {ClientRequest} from '@chatwidget/shared';
import {type ChatSocket, SOCKET_OPEN} from '../core/socket';
import type {ProviderStreamFn} from '../core/provider';
import {streamToSocket, USER_CANCEL_REASON} from '../core/pump';

// Max time per job so a hang does not block the queue.
const GENERATION_TIMEOUT_MS = 40_000;

interface QueueEntry {
  ws: ChatSocket;
  request: ClientRequest;
  streamFn: ProviderStreamFn;
}

// One job at a time. Handles order, queue position, and timeout.
export function createQueueManager() {
  let queue: QueueEntry[] = [];
  let isProcessing = false;
  let processingId: string | null = null;
  let activeSocket: ChatSocket | null = null;
  let activeController: AbortController | null = null;

  const broadcastPositions = () => {
    const length = queue.length;
    const isSomeoneProcessing = processingId !== null;
    queue.forEach((entry, idx) => {
      if (entry.ws.readyState === SOCKET_OPEN) {
        entry.ws.send(
          JSON.stringify({
            type: 'queue',
            id: entry.request.id,
            position: idx,
            length,
            isSomeoneProcessing,
          }),
        );
      }
    });
  };

  const processNext = async () => {
    if (isProcessing) return;
    const entry = queue.shift();
    if (!entry) return;

    const {ws, request, streamFn} = entry;

    isProcessing = true;
    processingId = request.id;
    activeSocket = ws;
    const controller = new AbortController();
    activeController = controller;
    broadcastPositions();

    console.log(
      `Processing request ID: ${request.id} with model: ${request.model}`,
    );

    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const stream = streamFn({
        model: request.model,
        messages: request.messages,
        signal: controller.signal,
      });
      await streamToSocket(ws, request.id, stream, controller.signal);
      console.log(`Completed processing request ID: ${request.id}`);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      isProcessing = false;
      processingId = null;
      activeSocket = null;
      activeController = null;
      broadcastPositions();
      setTimeout(() => void processNext(), 10);
    }
  };

  const enqueue = (
    ws: ChatSocket,
    request: ClientRequest,
    streamFn: ProviderStreamFn,
  ) => {
    queue.push({ws, request, streamFn});
    broadcastPositions();
    void processNext();
  };

  // Stop by id. Aborts the active job or drops it from the queue.
  const cancel = (ws: ChatSocket, id: string) => {
    if (processingId === id && activeSocket === ws) {
      activeController?.abort(USER_CANCEL_REASON);
      return;
    }
    const before = queue.length;
    queue = queue.filter((entry) => !(entry.ws === ws && entry.request.id === id));
    if (queue.length !== before) {
      broadcastPositions();
    }
  };

  const removeSocket = (ws: ChatSocket) => {
    if (activeSocket === ws && activeController) {
      activeController.abort();
    }
    const before = queue.length;
    queue = queue.filter((entry) => entry.ws !== ws);
    if (queue.length !== before) {
      broadcastPositions();
    }
  };

  return {enqueue, cancel, removeSocket};
}

export type QueueManager = ReturnType<typeof createQueueManager>;
