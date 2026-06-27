import {useRef} from 'react';
import {ArrowUp} from '@/icons/ArrowUp';
import {LoaderCircle} from '@/icons/LoaderCircle';
import {Square} from '@/icons/Square';

interface InputSectionProps {
  message: string;
  loading: boolean;
  isGenerating: boolean;
  hasStarted: boolean;
  isReasoning: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  sendPrompt: (quickPrompt?: string) => void;
  stopGeneration: () => void;
}

export const InputSection = ({
  message,
  loading,
  isGenerating,
  hasStarted,
  isReasoning,
  handleInputChange,
  sendPrompt,
  stopGeneration,
}: InputSectionProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInFlight = loading || isGenerating;
  const canStop = isInFlight && hasStarted && !isReasoning;
  const isWaiting = isInFlight && !canStop;
  const isDisabled = isWaiting || (!isInFlight && message.trim() === '');

  return (
    <div className='shrink-0 bg-white px-3 pb-3.5 pt-0'>
      <label htmlFor='chat-input' className='sr-only'>
        Type your question here
      </label>
      <div className='relative flex items-end rounded-xl border border-slate-200 bg-slate-50 focus-within:border-slate-700 transition-colors'>
        <textarea
          ref={textareaRef}
          id='chat-input'
          value={message}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !loading && !isGenerating) {
              e.preventDefault();
              sendPrompt();
            }
          }}
          placeholder='Write a message…'
          rows={1}
          maxLength={500}
          className='scrollbar-hide flex-1 resize-none outline-none bg-transparent px-3.5 py-2.5 pr-12 text-base leading-normal text-slate-900 placeholder:text-slate-400 field-sizing-content min-h-11 max-h-17 overflow-y-auto overscroll-none'
        />
        <button
          type='button'
          onClick={() => (canStop ? stopGeneration() : sendPrompt())}
          disabled={isDisabled}
          aria-label={canStop ? 'Stop generating' : 'Send message'}
          aria-busy={isWaiting}
          className={`absolute right-1.5 bottom-1.5 h-8 w-8 grid place-content-center rounded-lg transition-all ${
            canStop
              ? 'border border-slate-200 bg-slate-200 text-slate-600 hover:border-slate-400'
              : 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400'
          }`}
        >
          {isWaiting ? (
            <LoaderCircle className='h-4 w-4 animate-spin' aria-hidden />
          ) : canStop ? (
            <Square className='h-4.5 w-4.5' aria-hidden />
          ) : (
            <ArrowUp className='h-4 w-4' strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
};
