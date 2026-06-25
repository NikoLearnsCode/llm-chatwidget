import {getQueueStatusLabel} from '../getQueueStatusLabel';
import {StreamContentRenderer, streamBubbleClassName} from './streamRenderers';
import type {StreamPresentation} from './useStreamPresentation';

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
    <p className={statusClassName}>
      {label}
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
      <div className={streamBubbleClassName}>
        <StreamContentRenderer presentation={presentation} />
      </div>
    </div>
  );
};
