import type {
  ClientRequest,
  OutgoingMessage,
  Provider,
} from '@chatwidget/shared';
import {createRateLimiter, type RateLimiter} from '../core/rateLimit';
import {streamToSocket, USER_CANCEL_REASON} from '../core/pump';
import {streamGeminiChat} from './gemini';
import type {ProviderStreamFn} from '../core/provider';
import {sendError, type ChatSocket} from '../core/socket';

// Cloud APIs run in parallel. Add new providers in CLOUD_PROVIDERS.

interface CloudProvider {
  stream: ProviderStreamFn;
  rateLimit: {max: number; windowMs: number};
  // Keep below client timeout. See connection-lifecycle.md.
  timeoutMs: number;
  allowedModels: Set<string>;
}

// Every provider except ollama needs an entry below.
type CloudProviderName = Exclude<Provider, 'ollama'>;

const CLOUD_PROVIDERS: Record<CloudProviderName, CloudProvider> = {
  gemini: {
    stream: streamGeminiChat,
    rateLimit: {max: 20, windowMs: 60_000},
    timeoutMs: 45_000,
    allowedModels: new Set(['gemini-2.5-flash']),
  },
};

export function createCloudRunner() {
  const limiters = new Map<CloudProviderName, RateLimiter>();
  for (const [name, cfg] of Object.entries(CLOUD_PROVIDERS) as [
    CloudProviderName,
    CloudProvider,
  ][]) {
    limiters.set(
      name,
      createRateLimiter(cfg.rateLimit.max, cfg.rateLimit.windowMs),
    );
  }

  // Active requests per socket, keyed by id so stop hits the right one.
  const active = new Map<ChatSocket, Map<string, AbortController>>();

  const addActive = (
    ws: ChatSocket,
    id: string,
    controller: AbortController,
  ) => {
    let byId = active.get(ws);
    if (!byId) {
      byId = new Map();
      active.set(ws, byId);
    }
    byId.set(id, controller);
  };

  const removeActive = (ws: ChatSocket, id: string) => {
    const byId = active.get(ws);
    if (!byId) return;
    byId.delete(id);
    if (byId.size === 0) active.delete(ws);
  };

  const run = async (
    ws: ChatSocket,
    request: ClientRequest,
    messages: OutgoingMessage[],
    provider: CloudProvider,
  ) => {
    const controller = new AbortController();
    addActive(ws, request.id, controller);
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

    try {
      const events = provider.stream({
        model: request.model,
        messages,
        signal: controller.signal,
      });
      await streamToSocket(ws, request.id, events, controller.signal);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      removeActive(ws, request.id);
    }
  };

  const serves = (provider: string): provider is CloudProviderName =>
    Object.prototype.hasOwnProperty.call(CLOUD_PROVIDERS, provider);

  const handle = (
    ws: ChatSocket,
    request: ClientRequest,
    messages: OutgoingMessage[],
  ) => {
    const name = request.provider;
    if (!name || !serves(name)) {
      sendError(
        ws,
        request.id,
        'unavailable',
        `Provider '${name}' is not available.`,
      );
      return;
    }

    const config = CLOUD_PROVIDERS[name];
    if (!config.allowedModels.has(request.model)) {
      sendError(
        ws,
        request.id,
        'unavailable',
        `Model '${request.model}' is not available.`,
      );
      return;
    }

    if (!limiters.get(name)!.take(ws.data.clientIp)) {
      sendError(ws, request.id, 'rate_limit', 'Rate limit exceeded.');
      return;
    }

    void run(ws, request, messages, config);
  };

  // Stop one request by id.
  const cancel = (ws: ChatSocket, id: string) => {
    active.get(ws)?.get(id)?.abort(USER_CANCEL_REASON);
  };

  const closeSocket = (ws: ChatSocket) => {
    const byId = active.get(ws);
    if (!byId) return;
    for (const controller of byId.values()) controller.abort();
    active.delete(ws);
  };

  return {serves, handle, cancel, closeSocket};
}

export type CloudRunner = ReturnType<typeof createCloudRunner>;
