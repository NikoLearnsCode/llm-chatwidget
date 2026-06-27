import {CHAT_ERRORS} from '@/lib/errors';
import {ChatMarkdown} from './ChatMarkdown';
import type {ChatMessage} from '../types';

interface MessageItemProps {
  message: ChatMessage;
  // Provided only for the latest message so retry acts on the current failure.
  onRetry?: () => void;
}

export const MessageItem = ({message, onRetry}: MessageItemProps) => {
  const isUser = message.role === 'user';

  if (message.isError) {
    const title = message.errorKind
      ? CHAT_ERRORS[message.errorKind].title
      : 'Something went wrong';

    return (
      <div
        className='flex my-8 justify-center mx-auto px-1.5 min-w-0'
        role='alert'
      >
        <div className='max-w-full min-w-0 text-center rounded-2xl bg-white px-3.5 py-2.5'>
          <p className='text-xl font-medium text-red-900'>{title}</p>
          <p className='text-xs mt-0.5 text-slate-800/90'>{message.content}</p>
          {onRetry && (
            <button
              type='button'
              onClick={onRetry}
              className='mt-3 rounded-lg border cursor-pointer border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100'
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className='flex min-w-0 justify-end'>
        <div
          role='article'
          aria-label='Your message'
          className='max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-[14px] text-white whitespace-pre-wrap wrap-break-word'
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-w-0 justify-start'>
      <div
        role='article'
        aria-label='Assistant message'
        className='chat-prose max-w-full min-w-0 font-medium rounded-2xl rounded-bl-md px-1.5 py-2.5 text-[14px] text-slate-900 prose prose-slate prose-sm prose-p:my-1 prose-headings:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-hr:my-5'
      >
        <ChatMarkdown text={message.content} />
      </div>
    </div>
  );
};
