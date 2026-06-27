import type {ChatMessage as SharedChatMessage} from '@chatwidget/shared';
import type {ChatErrorKind} from '@/lib/errors';

export type {Role} from '@chatwidget/shared';

export interface ChatMessage extends SharedChatMessage {
  errorKind?: ChatErrorKind;
}

// Built in ChatProvider, used by StreamingDisplay.
export interface StreamPresentation {
  visibleText: string;
  hasVisibleContent: boolean;
  // Streamdown fades in new words and shows a caret while this is true.
  isAnimating: boolean;
  // Server is done and the fade finished. Unlocks finalize.
  isPresentationComplete: boolean;
}
