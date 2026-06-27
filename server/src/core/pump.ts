import {type ChatSocket, SOCKET_OPEN} from './socket';
import type {ProviderStreamEvent} from './provider';

// User hit stop. Client already cleaned up so we send nothing.
export const USER_CANCEL_REASON = 'user_cancel';

// Maps provider events to socket frames. Shared by queue and cloud.
export async function streamToSocket(
  ws: ChatSocket,
  id: string,
  stream: AsyncGenerator<ProviderStreamEvent>,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const event of stream) {
      if (ws.readyState !== SOCKET_OPEN) break;

      if (event.kind === 'started') {
        ws.send(
          JSON.stringify({
            type: 'started',
            id,
            ...(event.reasoning ? {reasoning: true} : {}),
          }),
        );
      } else if (event.kind === 'content') {
        ws.send(JSON.stringify({type: 'content', id, delta: event.delta}));
      } else if (event.kind === 'done') {
        ws.send(JSON.stringify({type: 'done', id}));
        break;
      } else if (event.kind === 'error') {
        ws.send(
          JSON.stringify({
            type: 'error',
            id,
            code: event.code,
            message: event.message,
          }),
        );
        break;
      }
    }
  } catch (err) {
    if (signal.aborted) {
      if (signal.reason !== USER_CANCEL_REASON && ws.readyState === SOCKET_OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            id,
            code: 'timeout',
            message: 'The request timed out. Please try again.',
          }),
        );
      }
    } else {
      console.error('Error during streaming:', err);
      if (ws.readyState === SOCKET_OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            id,
            code: 'transient',
            message: 'Error occurred during streaming',
          }),
        );
      }
    }
  }
}
