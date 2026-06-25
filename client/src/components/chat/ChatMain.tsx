import {useState, useRef, useEffect, useCallback} from 'react';
import {v4 as uuidv4} from 'uuid';
import type {ServerMessage, ClientRequest} from '@chatwidget/shared';
import {CHAT_ERRORS, type ChatErrorKind} from '@/lib/errors';
import type {ChatMessage} from './types';
import {ChatButton} from './ChatButton';
import {ChatWidget} from './ChatWidget';
import {ChatLayout} from './ChatLayout';
import {getQueueStatusLabel} from './getQueueStatusLabel';
import {useStreamPresentation} from './stream';
import {getWebSocketUrl} from '@/lib/wsUrl';
import {isDesktopViewport} from '@/lib/viewport';

const LAUNCHER_ID = 'ai-chat';
const CHAT_INPUT_ID = 'chat-input';
const CHAT_DIALOG_ID = 'chat-widget-dialog';

// const SELECTED_MODEL = 'deepseek-r1:8b';
const SELECTED_MODEL = 'llama3.1:8b';
const MAX_HISTORY = 10;

// Phase 1: reach the server and get its near-instant `queue` confirmation, else
// assume it's unreachable and fail fast.
const CONNECT_TIMEOUT_MS = 8_000;

// Phase 2: server is queueing/generating. Re-armed on every message, so it only
// fires on real silence. Sits above the server's 40s cap so its error wins first.
const RESPONSE_TIMEOUT_MS = 50_000;

// Reconnect backoff cap. Below CONNECT_TIMEOUT_MS so a queued send isn't killed
// while sitting in a backoff gap.
const RECONNECT_MAX_DELAY_MS = 5_000;

export default function ChatMain() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState<number | null>(null);
  const [isSomeoneProcessing, setIsSomeoneProcessing] = useState(false);

  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [receivedText, setReceivedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [isStreamComplete, setIsStreamComplete] = useState(false);

  const hasScrolledOnOpen = useRef(false);
  const userTriedToSend = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Phase 1 / phase 2 deadlines. Only one runs at a time; arming either clears both.
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Request submitted while connecting; flushed by onopen so a click never
  // no-ops mid-reconnect.
  const pendingPayloadRef = useRef<string | null>(null);
  // Id of the request we're waiting on. Frames whose id doesn't match are stale
  // replies (e.g. from an abandoned request) and get dropped.
  const currentRequestIdRef = useRef<string | null>(null);

  const resetStreamBuffer = useCallback(() => {
    setReceivedText('');
    setIsStreamComplete(false);
  }, []);

  const streamPresentation = useStreamPresentation({
    receivedText,
    isStreamComplete,
    isGenerating,
  });

  const finalizeStream = useCallback(
    (text: string) => {
      if (text.trim()) {
        setLiveAnnouncement(text);
        setMessages((existing) => {
          const last = existing[existing.length - 1];
          if (last && last.content === text) return existing;
          return [
            ...existing,
            {role: 'assistant', content: text, model: SELECTED_MODEL},
          ];
        });
      }
      resetStreamBuffer();
      setIsGenerating(false);
      setLoading(false);
    },
    [resetStreamBuffer],
  );

  useEffect(() => {
    if (!isStreamComplete || !streamPresentation.isPresentationComplete) return;
    finalizeStream(receivedText);
  }, [
    isStreamComplete,
    streamPresentation.isPresentationComplete,
    receivedText,
    finalizeStream,
  ]);

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

  const pushErrorToMessages = useCallback(
    (kind: ChatErrorKind) => {
      clearTimers();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: CHAT_ERRORS[kind].body,
          isError: true,
          errorKind: kind,
        },
      ]);
      setIsGenerating(false);
      setLoading(false);
      resetStreamBuffer();
      setIsReasoning(false);
      setStatusAnnouncement('');
    },
    [clearTimers, resetStreamBuffer],
  );

  // Give up on the in-flight request, dropping any queued send so a late reconnect
  // can't flush a stale payload.
  const failRequest = useCallback(
    (kind: ChatErrorKind) => {
      pendingPayloadRef.current = null;
      currentRequestIdRef.current = null;
      userTriedToSend.current = false;
      pushErrorToMessages(kind);
    },
    [pushErrorToMessages],
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

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(LAUNCHER_ID)?.focus();
    });
  }, []);

  // Desktop: focus the input. Mobile: focus the dialog so VoiceOver announces
  // the modal without opening the keyboard.
  useEffect(() => {
    if (!isChatOpen) return;
    const frameId = requestAnimationFrame(() => {
      if (isDesktopViewport()) {
        document.getElementById(CHAT_INPUT_ID)?.focus();
      } else {
        document
          .getElementById(CHAT_DIALOG_ID)
          ?.focus({preventScroll: true});
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen || !isGenerating) {
      setStatusAnnouncement('');
      return;
    }
    if (!hasStarted) {
      setStatusAnnouncement(
        getQueueStatusLabel(
          queuePosition,
          queueLength,
          isSomeoneProcessing,
        ),
      );
      return;
    }
    if (isReasoning && !receivedText) {
      setStatusAnnouncement('Reasoning');
      return;
    }
    if (receivedText) {
      setStatusAnnouncement('Assistant is replying');
      return;
    }
    setStatusAnnouncement('');
  }, [
    isChatOpen,
    isGenerating,
    hasStarted,
    queuePosition,
    queueLength,
    isSomeoneProcessing,
    isReasoning,
    receivedText,
  ]);

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 4 && h < 12) setGreeting('Good morning!');
    else if (h >= 12 && h < 17) setGreeting('Good afternoon!');
    else if (h >= 17 && h < 23) setGreeting('Good evening!');
    else setGreeting('Good night!');
  }, []);

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

      // Waiting in line - update queue position in the UI.
      if ('type' in msg && msg.type === 'queue') {
        armResponseTimer();
        setQueuePosition(msg.position);
        setQueueLength(msg.length);
        setIsSomeoneProcessing(msg.isSomeoneProcessing);
        return;
      }

      // Stream finished — wait for presentation (e.g. word-queue catch-up) before
      // moving the reply into the thread.
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
          pushErrorToMessages('transient');
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
          // Sent at last; now waiting for the server's confirmation (phase 1).
          armConnectTimer();
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        // A failed socket always fires close right after; reset state there.
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event: CloseEvent) => {
        // A queued-but-unsent request rides through reconnects; only treat a
        // close as a failure once we've sent something.
        if (pendingPayloadRef.current === null) {
          clearTimers();
          if (userTriedToSend.current) {
            if (event.code === 1006 || event.code === 1001) {
              pushErrorToMessages('interrupted');
            } else {
              pushErrorToMessages('unavailable');
            }
          }
          userTriedToSend.current = false;
          resetStreamBuffer();
          setIsReasoning(false);
          setIsGenerating(false);
          setLoading(false);
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
    pushErrorToMessages,
    armConnectTimer,
    armResponseTimer,
    clearTimers,
    resetStreamBuffer,
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Show `conversation` as the thread and stream a reply. Shared by send and retry.
  const submit = useCallback(
    (conversation: ChatMessage[]) => {
      setMessages(conversation);
      setLoading(true);
      setIsGenerating(true);
      setUserScrolledUp(false);
      setHasStarted(false);
      setIsReasoning(false);
      resetStreamBuffer();
      setLiveAnnouncement('');
      setQueuePosition(null);

      // Error bubbles are display-only; never send them to the model as history.
      const messagesForApi = conversation
        .filter((m) => !m.isError)
        .slice(-MAX_HISTORY)
        .map(({role, content}) => ({role, content}));

      const payload: ClientRequest = {
        id: uuidv4(),
        model: SELECTED_MODEL,
        messages: messagesForApi,
      };
      const payloadStr = JSON.stringify(payload);

      currentRequestIdRef.current = payload.id;
      userTriedToSend.current = true;
      // Phase 1 deadline: covers "can't connect" and "sent, awaiting confirmation".
      armConnectTimer();

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payloadStr);
      } else {
        // Socket still connecting or mid-reconnect: hold it for onopen to flush.
        pendingPayloadRef.current = payloadStr;
      }
    },
    [armConnectTimer, resetStreamBuffer],
  );

  const sendPrompt = (quick?: string) => {
    const text = (quick ?? input).trim();
    if (!text) return;
    if (loading || isGenerating) return;

    setInput('');
    submit([...messages, {role: 'user', content: text}]);
  };

  // Drop trailing error bubble(s) and resend the thread; the last user message is
  // already in history, so no duplicate.
  const retryLastMessage = useCallback(() => {
    if (loading || isGenerating) return;

    const thread = [...messages];
    while (thread.length > 0 && thread[thread.length - 1].isError) {
      thread.pop();
    }
    if (!thread.some((m) => m.role === 'user')) return;

    submit(thread);
  }, [loading, isGenerating, messages, submit]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    chatEndRef.current?.scrollIntoView({behavior});
  }, []);

  // Scroll to bottom when generating if user hasn't scrolled up
  useEffect(() => {
    if (
      isGenerating &&
      streamPresentation.hasVisibleContent &&
      !userScrolledUp
    ) {
      scrollToBottom('auto');
    }
  }, [
    isGenerating,
    streamPresentation.hasVisibleContent,
    streamPresentation.visibleText,
    userScrolledUp,
    scrollToBottom,
  ]);

  // Scroll to bottom when a new message is added, sentPrompt will set userScrolledUp to false
  useEffect(() => {
    if (messages[messages.length - 1] && !userScrolledUp) {
      scrollToBottom('auto');
    }
  }, [messages, scrollToBottom, userScrolledUp]);

  // Scroll to bottom when the chat is opened and the user hasn't scrolled
  useEffect(() => {
    if (isChatOpen && !hasScrolledOnOpen.current && messages.length > 0) {
      hasScrolledOnOpen.current = true;
      setTimeout(() => {
        scrollToBottom('auto');
      }, 0);
    }
    // Reset when chat is closed
    if (!isChatOpen) {
      hasScrolledOnOpen.current = false;
    }
  }, [isChatOpen, scrollToBottom, messages.length]);

  // Track whether the user has scrolled away from the bottom
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const threshold = 5; // 5px threshold to consider the user has scrolled up
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setUserScrolledUp(distanceFromBottom > threshold);
  }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!isChatOpen || !container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isChatOpen, handleScroll, messages.length]);

  return (
    <>
      <ChatButton setIsOpen={setIsChatOpen} isOpen={isChatOpen} />
      <ChatWidget isOpen={isChatOpen} onClose={closeChat}>
        <ChatLayout
          messages={messages}
          message={input}
          loading={loading}
          greeting={greeting}
          scrollToBottom={scrollToBottom}
          userScrolledUp={userScrolledUp}
          hasStarted={hasStarted}
          receivedText={receivedText}
          streamPresentation={streamPresentation}
          isReasoning={isReasoning}
          liveAnnouncement={liveAnnouncement}
          statusAnnouncement={statusAnnouncement}
          onCloseChat={closeChat}
          queuePosition={queuePosition}
          queueLength={queueLength}
          isSomeoneProcessing={isSomeoneProcessing}
          chatContainerRef={chatContainerRef}
          handleInputChange={handleInputChange}
          sendPrompt={sendPrompt}
          onRetry={retryLastMessage}
          isGenerating={isGenerating}
          setMessages={setMessages}
          chatEndRef={chatEndRef}
        />
      </ChatWidget>
    </>
  );
}
