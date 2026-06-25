import type {StreamVisualMode} from './streamEffects';

// Streaming animation config. Switch animation here by changing the value:
//   'fade'       — phrase fade (sentences)
//   'word-queue' — word-by-word
//   'instant'    — no animation (reduced-motion fallback)
export const STREAM_VISUAL_MODE: StreamVisualMode = 'word-queue';

// Word-queue settings: word added every WORD_REVEAL_INTERVAL_MS (lower = faster).
// After 'done', remaining words drain within WORD_QUEUE_FLUSH_MS.
export const WORD_REVEAL_INTERVAL_MS = 60;
export const WORD_QUEUE_FLUSH_MS = 3000;

// Phrase-queue settings: phrase added every PHRASE_REVEAL_INTERVAL_MS.
// After 'done', remaining phrases drain within PHRASE_QUEUE_FLUSH_MS.
export const PHRASE_REVEAL_INTERVAL_MS = 120;
export const PHRASE_QUEUE_FLUSH_MS = 1500;
