import {getQueueStatusLabel} from '../../../lib/getQueueStatusLabel';
import {ChatMarkdown} from './ChatMarkdown';
import type {StreamPresentation} from '../types';

const streamBubbleClassName =
  'chat-prose max-w-full min-w-0 font-medium rounded-2xl rounded-bl-md px-1.5 py-2.5 text-[14px] text-slate-900 prose prose-slate prose-sm prose-p:my-1 prose-headings:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100';

interface StreamingDisplayProps {
  isGenerating: boolean;
  receivedText: string;
  presentation: StreamPresentation;
  isReasoning: boolean;
  hasStarted: boolean;
  queuePosition: number | null;
  queueLength: number | null;
  isSomeoneProcessing: boolean;
}

const statusClassName = 'px-1.5 py-2 text-[13px] text-slate-600';

function AnimatedStatus({label}: {label: string}) {
  return (
    <p className={`${statusClassName} chat-status-pulse`}>
      <span key={label} className='chat-status-label'>
        {label}
      </span>
      <span className='chat-status-dots' aria-hidden='true' />
    </p>
  );
}

export const StreamingDisplay = ({
  isGenerating,
  receivedText,
  presentation,
  isReasoning,
  hasStarted,
  queuePosition,
  queueLength,
  isSomeoneProcessing,
}: StreamingDisplayProps) => {
  if (!isGenerating) return null;

  if (!hasStarted) {
    const label = getQueueStatusLabel(
      queuePosition,
      queueLength,
      isSomeoneProcessing,
    );

    return (
      <div className='flex min-w-0 justify-start'>
        <AnimatedStatus label={label} />
      </div>
    );
  }

  if (isReasoning && !receivedText) {
    return (
      <div className='flex min-w-0 justify-start'>
        <AnimatedStatus label='Reasoning' />
      </div>
    );
  }

  if (!presentation.hasVisibleContent) return null;

  return (
    <div className='flex min-w-0 justify-start'>
      <ChatMarkdown
        text={presentation.visibleText}
        isAnimating={presentation.isAnimating}
        className={streamBubbleClassName}
      />
    </div>
  );
};
