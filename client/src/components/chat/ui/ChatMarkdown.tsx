import {memo} from 'react';
import {Streamdown, type Components} from 'streamdown';

// Word fade duration. ChatProvider waits this long after done before finalizing,
// so keep them in sync.
export const STREAM_FADE_DURATION_MS = 220;

// Open links in a new tab, same style in streaming and finished messages.
const components = {
  a: (props: unknown) => {
    const {href, children} = props as {
      href?: string;
      children?: React.ReactNode;
    };
    return (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        className='text-slate-900 underline underline-offset-2 hover:text-slate-700'
      >
        {children}
      </a>
    );
  },
} satisfies Components;

interface ChatMarkdownProps {
  text: string;
  className?: string;
  // True while streaming: words fade in and a caret trails. Off for finished
  // messages so there is no animation work.
  isAnimating?: boolean;
}

// One markdown renderer for the whole chat. Streamdown heals half-finished
// markdown while it streams and only animates the new words, so we just feed it
// the growing text.
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  className,
  isAnimating = false,
}: ChatMarkdownProps) {
  return (
    <Streamdown
      className={className}
      components={components}
      controls={false}
      // Keep stagger at 0. Streamdown's default delays each word a bit more than
      // the last, and with bursty Ollama chunks that overlaps into a messy
      // out-of-order fade. With 0 the new words in a chunk fade in together.
      animated={{
        animation: 'fadeIn',
        sep: 'word',
        duration: STREAM_FADE_DURATION_MS,
        stagger: 0,
      }}
      isAnimating={isAnimating}
      caret={isAnimating ? 'block' : undefined}
    >
      {text}
    </Streamdown>
  );
});
