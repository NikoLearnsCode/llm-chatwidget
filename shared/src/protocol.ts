// WebSocket types shared by client and server.
export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: Role;
  content: string;
  timestamp?: string;
  model?: string;
  isError?: boolean;
}

export interface OutgoingMessage {
  role: Role;
  content: string;
}

// Backend choice. Ollama uses the queue.
export type Provider = 'ollama' | 'gemini';

export interface ClientRequest {
  id: string;
  // Defaults to ollama for old clients.
  provider?: Provider;
  model: string;
  messages: OutgoingMessage[];
}

// Ask the server to stop this request.
export interface ClientStopRequest {
  type: 'stop';
  id: string;
}

// Chat requests have no type field. Stops use type stop.
export type ClientMessage = ClientRequest | ClientStopRequest;

export interface QueueServerMessage {
  type: 'queue';
  id: string;
  position: number;
  length: number;
  isSomeoneProcessing: boolean;
}

export interface DoneServerMessage {
  type: 'done';
  id: string;
}

// Error kind. Client turns this into UI text.
export type ServerErrorCode =
  | 'rate_limit'
  | 'unavailable'
  | 'timeout'
  | 'transient';

export interface ErrorServerMessage {
  type: 'error';
  // Omitted when we do not have a request id yet.
  id?: string;
  code?: ServerErrorCode;
  // For logs. UI uses code not message.
  message: string;
}

export type ServerMessage =
  | QueueServerMessage
  | DoneServerMessage
  | ErrorServerMessage
  | {type: 'started'; id: string; reasoning?: boolean}
  | {type: 'content'; id: string; delta: string};
