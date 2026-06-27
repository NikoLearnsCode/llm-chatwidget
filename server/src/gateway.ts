import type {ClientRequest, OutgoingMessage} from '@chatwidget/shared';
import type {ChatSocket} from './core/socket';
import {systemPromptTest} from '../systemPrompts/assistant.prompt';
import {createLocalRunner} from './local';
import {createCloudRunner} from './cloud';

// Local goes through the queue, cloud runs straight through.
export function createGateway() {
  const local = createLocalRunner();
  const cloud = createCloudRunner();

  const handleRequest = (ws: ChatSocket, request: ClientRequest) => {
    const messages: OutgoingMessage[] = [
      {role: 'system', content: systemPromptTest},
      ...request.messages,
    ];

    // Missing provider means ollama for old clients.
    const provider = request.provider ?? 'ollama';
    if (cloud.serves(provider)) {
      cloud.handle(ws, request, messages);
    } else {
      local.handle(ws, request, messages);
    }
  };

  // Stop by id. Each runner only handles its own requests.
  const handleStop = (ws: ChatSocket, id: string) => {
    local.cancel(ws, id);
    cloud.cancel(ws, id);
  };

  const handleClose = (ws: ChatSocket) => {
    local.closeSocket(ws);
    cloud.closeSocket(ws);
  };

  return {handleRequest, handleStop, handleClose};
}

export type Gateway = ReturnType<typeof createGateway>;
