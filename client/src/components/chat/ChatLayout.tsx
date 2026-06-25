import type {ChatMessage} from './types';
import {ChatHeader} from './ChatHeader';
import {MessageItem} from './MessageItem';
import {ScrollButton} from './ScrollButton';
import {InputSection} from './InputSection';
import {QuickQuestionsSection} from './QuickQuestionsSection';
import {StreamingDisplay, type StreamPresentation} from './stream';

interface ChatLayoutProps {
  messages: ChatMessage[];
  message: string;
  loading: boolean;
  hasStarted: boolean;
  isGenerating: boolean;
  queuePosition: number | null;
  queueLength: number | null;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  isSomeoneProcessing: boolean;
  receivedText: string;
  streamPresentation: StreamPresentation;
  isReasoning: boolean;
  liveAnnouncement: string;
  statusAnnouncement: string;
  greeting: string;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  setMessages: (m: ChatMessage[]) => void;
  onCloseChat: () => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  sendPrompt: (quickPrompt?: string) => void;
  onRetry: () => void;
  userScrolledUp: boolean;
}

export const ChatLayout = ({
  messages,
  message,
  loading,
  receivedText,
  streamPresentation,
  isReasoning,
  liveAnnouncement,
  statusAnnouncement,
  greeting,
  queueLength,
  hasStarted,
  queuePosition,
  isSomeoneProcessing,
  setMessages,
  chatContainerRef,
  isGenerating,
  onCloseChat,
  handleInputChange,
  sendPrompt,
  onRetry,
  chatEndRef,
  userScrolledUp,
  scrollToBottom,
}: ChatLayoutProps) => {
  const hasMessages = messages.length > 0;

  const handleNewChat = () => {
    setMessages([]);
  };
  return (
    <div className='relative flex min-w-0 flex-col h-full bg-white overflow-hidden'>
      <ChatHeader
        hasMessages={hasMessages}
        loading={loading}
        onNewChat={handleNewChat}
        onClose={onCloseChat}
      />

      {hasMessages ? (
        <main
          ref={chatContainerRef}
          id='chat-widget-main'
          role='log'
          aria-label='Conversation'
          aria-busy={isGenerating}
          aria-relevant='additions'
          className='chat-messages flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-2 pt-4 outline-slate-900 space-y-2.5 max-md:touch-pan-y scrollbar-gutter-both'
        >
          {messages
            .filter((m) => m.role !== 'system')
            .map((msg, i, arr) => (
              <MessageItem
                key={i}
                message={msg}
                onRetry={
                  i === arr.length - 1 && msg.isError ? onRetry : undefined
                }
              />
            ))}
          <StreamingDisplay
            isGenerating={isGenerating}
            receivedText={receivedText}
            presentation={streamPresentation}
            isReasoning={isReasoning}
            hasStarted={hasStarted}
            queuePosition={queuePosition}
            queueLength={queueLength}
            isSomeoneProcessing={isSomeoneProcessing}
          />
          <div ref={chatEndRef} />
        </main>
      ) : (
        <QuickQuestionsSection
          hasMessages={hasMessages}
          greeting={greeting}
          sendPrompt={sendPrompt}
          loading={loading}
        />
      )}

      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {statusAnnouncement}
      </div>
      {/* Final reply only - not every streamed token. */}
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {liveAnnouncement}
      </div>

      <ScrollButton
        userScrolledUp={userScrolledUp}
        hasMessages={hasMessages}
        loading={loading}
        isGenerating={isGenerating}
        scrollToBottom={scrollToBottom}
      />

      <InputSection
        message={message}
        loading={loading}
        isGenerating={isGenerating}
        handleInputChange={handleInputChange}
        sendPrompt={sendPrompt}
      />
    </div>
  );
};
