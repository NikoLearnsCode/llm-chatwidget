export interface StreamEffectDefinition {
  name: string;
  reveal: 'instant' | 'word-queue' | 'phrase-queue';
  chunkAnimationClass?: string;
  chunkAnimationDurationMs?: number;
  caret?: boolean;
  reducedMotionFallback?: string;
}

export const STREAM_EFFECTS = {
  // No animation. Baseline / reduced-motion fallback.
  instant: {
    name: 'instant',
    reveal: 'instant',
  },
  // Phrase-at-a-time reveal with per-phrase fade (stream-fade). No caret.
  fade: {
    name: 'fade',
    reveal: 'phrase-queue',
    chunkAnimationClass: 'stream-fade',
    chunkAnimationDurationMs: 320,
    caret: false,
    reducedMotionFallback: 'instant',
  },
  // Word-at-a-time reveal with per-word fade (stream-word-in) and trailing caret.
  'word-queue': {
    name: 'word-queue',
    reveal: 'word-queue',
    chunkAnimationClass: 'stream-word-in',
    chunkAnimationDurationMs: 220,
    caret: true,
    reducedMotionFallback: 'instant',
  },
} as const satisfies Record<string, StreamEffectDefinition>;

export type StreamVisualMode = keyof typeof STREAM_EFFECTS;

// Active mode and tuning: streamConfig.ts

// Resolve the active effect, honouring reduced-motion preference.
export function resolveStreamEffect(
  mode: StreamVisualMode,
  prefersReducedMotion: boolean,
): StreamEffectDefinition {
  const effect: StreamEffectDefinition = STREAM_EFFECTS[mode];
  if (prefersReducedMotion && effect.reducedMotionFallback) {
    return STREAM_EFFECTS[effect.reducedMotionFallback as StreamVisualMode];
  }
  return effect;
}
