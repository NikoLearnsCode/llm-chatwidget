import {RotateCcw} from '@/icons/RotateCcw';
import {X} from '@/icons/X';

interface ChatHeaderProps {
  hasMessages: boolean;
  loading: boolean;
  onNewChat: () => void;
  onClose: () => void;
}

export const ChatHeader = ({
  hasMessages,
  loading,
  onNewChat,
  onClose,
}: ChatHeaderProps) => {
  return (
    <header className='grid shrink-0 grid-cols-[2.5rem_1fr_2.5rem] items-center h-12 border-b border-slate-200 bg-white px-2'>
      <div>
        {hasMessages && (
          <button
            type='button'
            onClick={onNewChat}
            disabled={loading}
            aria-label='Start a new chat'
            title='New chat'
            className='h-8 w-8 grid place-content-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent'
          >
            <RotateCcw size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      <h2
        id='chat-widget-title'
        className='text-center text-sm font-medium text-slate-900 tracking-tight'
      >
        Online assistant
      </h2>

      <div className='flex justify-end'>
        <button
          type='button'
          onClick={onClose}
          aria-label='Close chat'
          title='Close'
          className='h-8 w-8 grid place-content-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors'
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
