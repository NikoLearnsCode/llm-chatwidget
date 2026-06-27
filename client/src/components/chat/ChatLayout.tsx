import {ChatHeader} from './ui/ChatHeader';
import {MessageItem} from './ui/MessageItem';
import {ScrollButton} from './ui/ScrollButton';
import {InputSection} from './ui/InputSection';
import {QuickQuestionsSection} from './ui/QuickQuestionsSection';
import {StreamingDisplay} from './ui/StreamingDisplay';
import {useChat} from './context/ChatContext';

export const ChatLayout = () => {
  const {
    messages,
    input,
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
    clearMessages,
    chatContainerRef,
    isGenerating,
    closeChat,
    handleInputChange,
    sendPrompt,
    stopGeneration,
    retryLastMessage,
    chatEndRef,
    userScrolledUp,
    scrollToBottom,
  } = useChat();

  const hasMessages = messages.length > 0;

  return (
    <div className='relative flex min-w-0 flex-col h-full bg-white overflow-hidden'>
      <ChatHeader
        hasMessages={hasMessages}
        loading={loading}
        onNewChat={clearMessages}
        onClose={closeChat}
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
                  i === arr.length - 1 && msg.isError
                    ? retryLastMessage
                    : undefined
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
        message={input}
        loading={loading}
        isGenerating={isGenerating}
        hasStarted={hasStarted}
        isReasoning={isReasoning}
        handleInputChange={handleInputChange}
        sendPrompt={sendPrompt}
        stopGeneration={stopGeneration}
      />
    </div>
  );
};
