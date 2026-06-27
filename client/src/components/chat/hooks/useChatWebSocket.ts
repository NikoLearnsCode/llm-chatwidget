import {useCallback, useEffect, useRef, useState} from 'react';
import type {ServerMessage} from '@chatwidget/shared';
import {type ChatErrorKind, serverErrorToKind} from '@/lib/errors';
import {getWebSocketUrl} from '@/lib/wsUrl';

// Phase 1: reach the server and get its near-instant `queue` confirmation,
// otherwise treat it as unreachable and fail fast.
const CONNECT_TIMEOUT_MS = 8_000;

// Phase 2: server is queueing or generating. Re-armed on every message, so it
// only fires on real silence. Sits above the server's 40s cap so its error
// wins first.
const RESPONSE_TIMEOUT_MS = 50_000;

// Reconnect backoff cap. Below CONNECT_TIMEOUT_MS so a queued send isn't killed
// while sitting in a backoff gap.
const RECONNECT_MAX_DELAY_MS = 5_000;

interface UseChatWebSocketOptions {
  // Append an error bubble to the thread (messages domain).
  onError: (kind: ChatErrorKind) => void;
  // Clear the in-flight lifecycle flags (loading, isGenerating).
  onIdle: () => void;
}

export interface ChatWebSocket {
  // Ingest state, driven entirely by incoming frames.
  receivedText: string;
  isStreamComplete: boolean;
  hasStarted: boolean;
  isReasoning: boolean;
  queuePosition: number | null;
  queueLength: number | null;
  isSomeoneProcessing: boolean;
  // Reset the streamed reply buffer (used after finalizing into the thread).
  resetStreamBuffer: () => void;
  // Clear ingest state ahead of a fresh request.
  prepareForNewRequest: () => void;
  // Send (or park, mid-reconnect) a serialized ClientRequest and arm phase 1.
  sendPayload: (payloadStr: string, requestId: string) => void;
  // Abort the in-flight request server-side and tear down local ingest state.
  cancelRequest: () => void;
}

// Network layer. Owns the lifetime WebSocket (with backoff reconnect), the two
// timeout phases, and all ingest state. Knows nothing about the DOM or the
// message thread. Reports failures via onError and onIdle.
export function useChatWebSocket({
  onError,
  onIdle,
}: UseChatWebSocketOptions): ChatWebSocket {
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState<number | null>(null);
  const [isSomeoneProcessing, setIsSomeoneProcessing] = useState(false);
  const [receivedText, setReceivedText] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [isStreamComplete, setIsStreamComplete] = useState(false);

  const userTriedToSend = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Phase 1 and phase 2 deadlines. Only one runs at a time, and arming either
  // clears both.
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Request submitted while connecting. Flushed by onopen so a click never
  // no-ops mid-reconnect.
  const pendingPayloadRef = useRef<string | null>(null);
  // Id of the request we're waiting on. Frames whose id doesn't match are stale
  // replies (e.g. from an abandoned request) and get dropped.
  const currentRequestIdRef = useRef<string | null>(null);

  const resetStreamBuffer = useCallback(() => {
    setReceivedText('');
    setIsStreamComplete(false);
  }, []);

  const prepareForNewRequest = useCallback(() => {
    setHasStarted(false);
    setIsReasoning(false);
    resetStreamBuffer();
    setQueuePosition(null);
  }, [resetStreamBuffer]);

  const clearTimers = useCallback(() => {
    if (connectTimerRef.current !== null) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (responseTimerRef.current !== null) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  // Tear down ingest and timer state for a failed request, then surface the error.
  const reportError = useCallback(
    (kind: ChatErrorKind) => {
      clearTimers();
      resetStreamBuffer();
      setIsReasoning(false);
      onError(kind);
      onIdle();
    },
    [clearTimers, resetStreamBuffer, onError, onIdle],
  );

  // Give up on the in-flight request and drop any queued send so a late reconnect
  // can't flush a stale payload.
  const failRequest = useCallback(
    (kind: ChatErrorKind) => {
      pendingPayloadRef.current = null;
      currentRequestIdRef.current = null;
      userTriedToSend.current = false;
      reportError(kind);
    },
    [reportError],
  );

  // Phase 1: reaching the server (connect + first confirmation).
  const armConnectTimer = useCallback(() => {
    clearTimers();
    connectTimerRef.current = setTimeout(
      () => failRequest('unavailable'),
      CONNECT_TIMEOUT_MS,
    );
  }, [clearTimers, failRequest]);

  // Phase 2: backstop above the server's 40s cap, re-armed on every message.
  const armResponseTimer = useCallback(() => {
    clearTimers();
    responseTimerRef.current = setTimeout(
      () => failRequest('timeout'),
      RESPONSE_TIMEOUT_MS,
    );
  }, [clearTimers, failRequest]);

  const sendPayload = useCallback(
    (payloadStr: string, requestId: string) => {
      currentRequestIdRef.current = requestId;
      userTriedToSend.current = true;
      // Phase 1 deadline covers both "can't connect" and "sent, awaiting reply".
      armConnectTimer();

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payloadStr);
      } else {
        // Socket still connecting or mid-reconnect. Hold it for onopen to flush.
        pendingPayloadRef.current = payloadStr;
      }
    },
    [armConnectTimer],
  );

  // Stop the in-flight request: tell the server to abort, then drop all in-flight
  // state so any late frames for this id are treated as stale and ignored.
  const cancelRequest = useCallback(() => {
    const id = currentRequestIdRef.current;
    const ws = wsRef.current;
    // Only worth a stop frame if we actually sent the request.
    if (id && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: 'stop', id}));
    }
    // A parked send that never went out is simply dropped here.
    pendingPayloadRef.current = null;
    currentRequestIdRef.current = null;
    userTriedToSend.current = false;
    clearTimers();
    prepareForNewRequest();
    onIdle();
  }, [clearTimers, prepareForNewRequest, onIdle]);

  // Keep a WebSocket open for the page lifetime, reconnecting with backoff so the
  // widget recovers without a reload.
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const handleMessage = (event: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
        return;
      }

      // Drop frames for a request we're no longer waiting on. Pre-queue errors
      // carry no id and fall through.
      if ('id' in msg && msg.id && msg.id !== currentRequestIdRef.current) {
        return;
      }

      // Waiting in line. Update queue position in the UI.
      if ('type' in msg && msg.type === 'queue') {
        armResponseTimer();
        setQueuePosition(msg.position);
        setQueueLength(msg.length);
        setIsSomeoneProcessing(msg.isSomeoneProcessing);
        return;
      }

      // Stream finished. Wait for the presentation (e.g. word-queue catch-up)
      // before moving the reply into the thread.
      if ('type' in msg && msg.type === 'done') {
        clearTimers();
        currentRequestIdRef.current = null;
        userTriedToSend.current = false;
        setIsStreamComplete(true);
        return;
      }

      if ('type' in msg && msg.type === 'error') {
        clearTimers();
        if (userTriedToSend.current) {
          userTriedToSend.current = false;
          reportError(serverErrorToKind(msg.code));
        }
        return;
      }

      if ('type' in msg && msg.type === 'started') {
        armResponseTimer();
        setHasStarted(true);
        setIsReasoning(msg.reasoning === true);
        setQueuePosition(null);
        return;
      }

      if ('type' in msg && msg.type === 'content') {
        armResponseTimer();
        setHasStarted(true);
        setIsReasoning(false);
        setQueuePosition(null);
        setReceivedText((prev) => prev + msg.delta);
        return;
      }
    };

    const connect = () => {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        attempts = 0;
        // Flush a request the user submitted while we were connecting.
        const pending = pendingPayloadRef.current;
        if (pending !== null) {
          pendingPayloadRef.current = null;
          ws.send(pending);
          // Sent at last. Now waiting for the server's confirmation (phase 1).
          armConnectTimer();
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        // A failed socket always fires close right after. Reset state there.
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event: CloseEvent) => {
        // A queued-but-unsent request rides through reconnects. Only treat a
        // close as a failure once we've sent something.
        if (pendingPayloadRef.current === null) {
          clearTimers();
          if (userTriedToSend.current) {
            userTriedToSend.current = false;
            if (event.code === 1006 || event.code === 1001) {
              reportError('interrupted');
            } else {
              reportError('unavailable');
            }
          } else {
            resetStreamBuffer();
            setIsReasoning(false);
            onIdle();
          }
        }

        if (disposed) return;
        const delay = Math.min(1000 * 2 ** attempts, RECONNECT_MAX_DELAY_MS);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, [
    armConnectTimer,
    armResponseTimer,
    clearTimers,
    resetStreamBuffer,
    reportError,
    onIdle,
  ]);

  return {
    receivedText,
    isStreamComplete,
    hasStarted,
    isReasoning,
    queuePosition,
    queueLength,
    isSomeoneProcessing,
    resetStreamBuffer,
    prepareForNewRequest,
    sendPayload,
    cancelRequest,
  };
}
