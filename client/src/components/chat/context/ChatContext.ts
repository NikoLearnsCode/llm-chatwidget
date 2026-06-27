import {createContext, useContext} from 'react';
import type {ChatMessage, StreamPresentation} from '../types';

export interface ChatContextValue {
  // UI / a11y
  isChatOpen: boolean;
  setIsChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeChat: () => void;
  greeting: string;
  statusAnnouncement: string;
  liveAnnouncement: string;
  // Message thread + lifecycle
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  isGenerating: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  sendPrompt: (quick?: string) => void;
  stopGeneration: () => void;
  retryLastMessage: () => void;
  clearMessages: () => void;
  // Connection ingest
  receivedText: string;
  hasStarted: boolean;
  isReasoning: boolean;
  queuePosition: number | null;
  queueLength: number | null;
  isSomeoneProcessing: boolean;
  // Stream presentation
  streamPresentation: StreamPresentation;
  // Scroll
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  userScrolledUp: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (ctx === null) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
