import {useCallback, useRef, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import type {ClientRequest, Provider} from '@chatwidget/shared';
import {CHAT_ERRORS, type ChatErrorKind} from '@/lib/errors';
import type {ChatMessage} from '../types';
import type {ChatWebSocket} from './useChatWebSocket';

const SELECTED_MODEL = 'llama3.1:8b';
// const SELECTED_MODEL = 'gemma4:e4b';
// const SELECTED_MODEL = 'gpt-oss';
const SELECTED_PROVIDER: Provider = 'ollama';

/* const SELECTED_MODEL = 'gemini-2.5-flash';
const SELECTED_PROVIDER: Provider = 'gemini'; */

const LOCAL_MAX_HISTORY = 10;

interface UseChatMessagesOptions {
  connection: ChatWebSocket;
  // Called when a new request is submitted (resets scroll tracking).
  onSubmit: () => void;
}

export interface ChatMessages {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  isGenerating: boolean;
  liveAnnouncement: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  sendPrompt: (quick?: string) => void;
  stopGeneration: () => void;
  retryLastMessage: () => void;
  clearMessages: () => void;
  // Wired into the connection. Append an error bubble and clear lifecycle flags.
  appendError: (kind: ChatErrorKind) => void;
  onIdle: () => void;
  // Move a finished reply into the thread (gated by the presentation upstream).
  finalize: (text: string) => void;
}

// Data layer. Owns the message thread, the input value, and the request
// lifecycle flags. Packs history into a ClientRequest and hands it to the
// connection. Never touches the socket or the DOM directly.
export function useChatMessages({
  connection,
  onSubmit,
}: UseChatMessagesOptions): ChatMessages {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const {prepareForNewRequest, sendPayload, resetStreamBuffer, cancelRequest} =
    connection;

  // Latest streamed text, mirrored into a ref so stopGeneration can grab the
  // partial reply without recreating its callback on every token.
  const receivedTextRef = useRef('');
  receivedTextRef.current = connection.receivedText;

  const onIdle = useCallback(() => {
    setIsGenerating(false);
    setLoading(false);
  }, []);

  const appendError = useCallback((kind: ChatErrorKind) => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: CHAT_ERRORS[kind].body,
        isError: true,
        errorKind: kind,
      },
    ]);
  }, []);

  const finalize = useCallback(
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

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  // Show `conversation` as the thread and stream a reply. Shared by send and retry.
  const submit = useCallback(
    (conversation: ChatMessage[]) => {
      setMessages(conversation);
      setLoading(true);
      setIsGenerating(true);
      onSubmit();
      setLiveAnnouncement('');
      prepareForNewRequest();

      // Error bubbles are display-only. Never send them to the model as history.
      const filtered = conversation.filter((m) => !m.isError);
      const messagesForApi = (
        SELECTED_PROVIDER === 'ollama'
          ? filtered.slice(-LOCAL_MAX_HISTORY)
          : filtered
      ).map(({role, content}) => ({role, content}));

      const payload: ClientRequest = {
        id: uuidv4(),
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        messages: messagesForApi,
      };

      sendPayload(JSON.stringify(payload), payload.id);
    },
    [prepareForNewRequest, sendPayload, onSubmit],
  );

  // Abort the in-flight request, but only once visible text is streaming (not
  // during the queue wait or the reasoning phase). Keep whatever streamed so far
  // by finalizing it into the thread before tearing down the connection state.
  const stopGeneration = useCallback(() => {
    if (!connection.hasStarted || connection.isReasoning) return;
    finalize(receivedTextRef.current);
    cancelRequest();
  }, [connection.hasStarted, connection.isReasoning, finalize, cancelRequest]);

  const sendPrompt = useCallback(
    (quick?: string) => {
      const text = (quick ?? input).trim();
      if (!text) return;
      if (loading || isGenerating) return;

      setInput('');
      submit([...messages, {role: 'user', content: text}]);
    },
    [input, loading, isGenerating, messages, submit],
  );

  // Drop trailing error bubbles and resend the thread. The last user message is
  // already in history, so there's no duplicate.
  const retryLastMessage = useCallback(() => {
    if (loading || isGenerating) return;

    const thread = [...messages];
    while (thread.length > 0 && thread[thread.length - 1].isError) {
      thread.pop();
    }
    if (!thread.some((m) => m.role === 'user')) return;

    submit(thread);
  }, [loading, isGenerating, messages, submit]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    input,
    loading,
    isGenerating,
    liveAnnouncement,
    handleInputChange,
    sendPrompt,
    stopGeneration,
    retryLastMessage,
    clearMessages,
    appendError,
    onIdle,
    finalize,
  };
}
