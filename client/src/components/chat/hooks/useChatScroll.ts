import {useCallback, useEffect, useRef, useState} from 'react';
import type {ChatMessage} from '../types';

interface UseChatScrollOptions {
  isChatOpen: boolean;
  isGenerating: boolean;
  messages: ChatMessage[];
  // From the stream presentation, so auto-scroll tracks the animated reveal
  // rather than the raw ingest buffer.
  hasVisibleContent: boolean;
  visibleText: string;
}

export interface ChatScroll {
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  userScrolledUp: boolean;
  setUserScrolledUp: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

// DOM layer. Tracks whether the user scrolled away from the bottom and keeps the
// view pinned to the latest content while a reply streams in.
export function useChatScroll({
  isChatOpen,
  isGenerating,
  messages,
  hasVisibleContent,
  visibleText,
}: UseChatScrollOptions): ChatScroll {
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const hasScrolledOnOpen = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    chatEndRef.current?.scrollIntoView({behavior});
  }, []);

  // Scroll to bottom when generating if user hasn't scrolled up
  useEffect(() => {
    if (isGenerating && hasVisibleContent && !userScrolledUp) {
      scrollToBottom('auto');
    }
  }, [isGenerating, hasVisibleContent, visibleText, userScrolledUp, scrollToBottom]);

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

  // Track whether the user has scrolled away from the bottom.
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const threshold = 5; // 5px threshold to consider the user has scrolled up
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const scrolledUpward = container.scrollTop < lastScrollTopRef.current - 1;
    lastScrollTopRef.current = container.scrollTop;

    if (distanceFromBottom <= threshold) {
      setUserScrolledUp(false); // back at the bottom → resume auto-follow
    } else if (scrolledUpward) {
      setUserScrolledUp(true); // deliberate scroll away → stop following
    }
  }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!isChatOpen || !container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isChatOpen, handleScroll, messages.length]);

  return {
    chatContainerRef,
    chatEndRef,
    userScrolledUp,
    setUserScrolledUp,
    scrollToBottom,
  };
}
