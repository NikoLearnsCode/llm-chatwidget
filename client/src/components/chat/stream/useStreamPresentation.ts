import {useEffect, useRef, useState} from 'react';
import {
  PHRASE_QUEUE_FLUSH_MS,
  PHRASE_REVEAL_INTERVAL_MS,
  STREAM_VISUAL_MODE,
  WORD_QUEUE_FLUSH_MS,
  WORD_REVEAL_INTERVAL_MS,
} from './streamConfig';
import {resolveStreamEffect, type StreamVisualMode} from './streamEffects';
import {usePrefersReducedMotion} from './usePrefersReducedMotion';

export interface StreamPresentation {
  mode: StreamVisualMode;
  visibleText: string;
  chunkKind?: 'word' | 'phrase';
  chunkAnimationClass?: string;
  chunkAnimationDurationMs?: number;
  hasVisibleContent: boolean;
  showCaret: boolean;
  // True when animation settled and finalize may run.
  isPresentationComplete: boolean;
}

interface UseStreamPresentationOptions {
  mode?: StreamVisualMode;
  receivedText: string;
  isStreamComplete: boolean;
  isGenerating: boolean;
}

// Same queue engine; word vs phrase differ in tokenizer and cadence.
const QUEUE_REVEALS = {
  'word-queue': {
    kind: 'word' as const,
    stableTokens: stableWordTokens,
    intervalMs: WORD_REVEAL_INTERVAL_MS,
    flushMs: WORD_QUEUE_FLUSH_MS,
  },
  'phrase-queue': {
    kind: 'phrase' as const,
    stableTokens: stablePhraseTokens,
    intervalMs: PHRASE_REVEAL_INTERVAL_MS,
    flushMs: PHRASE_QUEUE_FLUSH_MS,
  },
};

export function useStreamPresentation({
  mode = STREAM_VISUAL_MODE,
  receivedText,
  isStreamComplete,
  isGenerating,
}: UseStreamPresentationOptions): StreamPresentation {
  const prefersReducedMotion = usePrefersReducedMotion();
  const effect = resolveStreamEffect(mode, prefersReducedMotion);

  // instant has no queue; word config is an inert default.
  const isQueue = effect.reveal !== 'instant';
  const queue =
    effect.reveal === 'phrase-queue'
      ? QUEUE_REVEALS['phrase-queue']
      : QUEUE_REVEALS['word-queue'];

  const chunkQueue = useChunkQueueReveal({
    active: isQueue && isGenerating,
    fullText: receivedText,
    isStreamComplete,
    stableTokens: queue.stableTokens,
    intervalMs: queue.intervalMs,
    flushMs: queue.flushMs,
  });

  // Defer finalize until the last chunk's fade finishes.
  const chunkSettled = useAnimationSettled({
    active: isQueue && Boolean(effect.chunkAnimationClass),
    trigger: chunkQueue.caughtUp,
    durationMs: effect.chunkAnimationDurationMs ?? 0,
  });

  if (isQueue) {
    return {
      mode: effect.name as StreamVisualMode,
      visibleText: chunkQueue.visibleText,
      chunkKind: queue.kind,
      chunkAnimationClass: effect.chunkAnimationClass,
      chunkAnimationDurationMs: effect.chunkAnimationDurationMs,
      hasVisibleContent: chunkQueue.visibleText.length > 0,
      showCaret: Boolean(effect.caret) && !chunkQueue.caughtUp,
      isPresentationComplete: chunkQueue.caughtUp && chunkSettled,
    };
  }

  // Instant: whole buffer, no animation.
  return {
    mode: effect.name as StreamVisualMode,
    visibleText: receivedText,
    hasVisibleContent: receivedText.length > 0,
    showCaret: false,
    isPresentationComplete: isStreamComplete,
  };
}

// --- Tokenizers -------------------------------------------------------------

// Lossless "word + trailing whitespace" tokens.
function tokenizeWords(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

// Hold back the final word mid-stream until trailing whitespace arrives.
function stableWordTokens(text: string, isStreamComplete: boolean): string[] {
  const tokens = tokenizeWords(text);
  if (
    !isStreamComplete &&
    tokens.length > 0 &&
    /\S$/.test(tokens[tokens.length - 1])
  ) {
    tokens.pop();
  }
  return tokens;
}

// Lossless phrases on .!?\n (naive on 3.14, e.g. - fine for fade).
function tokenizePhrases(text: string): string[] {
  return text.match(/[\s\S]*?[.!?\n]+[ \t]*|[\s\S]+$/g) ?? [];
}

// Hold back the final phrase until a sentence boundary arrives.
function stablePhraseTokens(text: string, isStreamComplete: boolean): string[] {
  const tokens = tokenizePhrases(text);
  if (
    !isStreamComplete &&
    tokens.length > 0 &&
    !/[.!?\n][ \t]*$/.test(tokens[tokens.length - 1])
  ) {
    tokens.pop();
  }
  return tokens;
}

// --- Chunk-queue reveal -----------------------------------------------------

interface ChunkQueueRevealOptions {
  active: boolean;
  fullText: string;
  isStreamComplete: boolean;
  // Chunk boundaries and trailing hold-back.
  stableTokens: (text: string, isStreamComplete: boolean) => string[];
  intervalMs: number;
  flushMs: number;
}

// Fixed-cadence chunk reveal; tokenizer and interval differ per mode.
function useChunkQueueReveal({
  active,
  fullText,
  isStreamComplete,
  stableTokens,
  intervalMs,
  flushMs,
}: ChunkQueueRevealOptions) {
  const [revealed, setRevealed] = useState(0);
  const revealedRef = useRef(0);
  const tokensRef = useRef<string[]>([]);
  const doneRef = useRef(false);
  const intervalRef = useRef(intervalMs);
  // Post-`done` drain ticks.
  const flushStepsRef = useRef(1);

  revealedRef.current = revealed;
  tokensRef.current = stableTokens(fullText, isStreamComplete);
  doneRef.current = isStreamComplete;
  intervalRef.current = intervalMs;
  flushStepsRef.current = Math.max(1, Math.round(flushMs / intervalMs));

  // Reset on empty buffer.
  useEffect(() => {
    if (fullText === '') {
      revealedRef.current = 0;
      setRevealed(0);
    }
  }, [fullText]);

  // Re-arm rAF driver when generation starts.
  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    let lastTime = performance.now();
    let backlog = 0;

    let fixedFlushRate: number | null = null;

    const tick = (now: number) => {
      backlog += now - lastTime;
      lastTime = now;

      const interval = intervalRef.current;
      if (backlog >= interval) {
        const intervals = Math.floor(backlog / interval);
        backlog -= intervals * interval;

        const total = tokensRef.current.length;
        const current = revealedRef.current;
        if (current < total) {
          // After done, drain backlog faster.
          let perInterval = 1;
          if (doneRef.current) {
            if (fixedFlushRate === null) {
              fixedFlushRate = Math.max(
                1,
                Math.ceil((total - current) / flushStepsRef.current),
              );
            }
            perInterval = fixedFlushRate;
          }

          const next = Math.min(total, current + intervals * perInterval);
          revealedRef.current = next;
          setRevealed(next);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  const tokens = tokensRef.current;
  const count = Math.min(revealed, tokens.length);
  return {
    visibleText: tokens.slice(0, count).join(''),
    // Reveal caught up; finalize still waits for fade (useAnimationSettled).
    caughtUp: isStreamComplete && count >= tokens.length,
  };
}

interface AnimationSettledOptions {
  active: boolean;
  // True when the trailing animation started.
  trigger: boolean;
  durationMs: number;
}

// True once durationMs has elapsed since trigger went true.
function useAnimationSettled({
  active,
  trigger,
  durationMs,
}: AnimationSettledOptions): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) {
      setSettled(true);
      return;
    }
    if (!trigger) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), durationMs);
    return () => clearTimeout(timer);
  }, [active, trigger, durationMs]);

  return settled;
}
