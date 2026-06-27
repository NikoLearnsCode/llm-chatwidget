import {useEffect, useRef} from 'react';
import {useScrollLock} from '@/hooks/useScrollLock';
import {useTouchScrollGuard} from '@/hooks/useTouchScrollGuard';
import {useIsMobileViewport} from '@/hooks/useIsMobileViewport';

interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

type DialogMode = 'modal' | 'non-modal';

// Chat shell on a native <dialog>.
// Mobile: showModal() for focus trap and native ESC.
// Desktop: show() so the page behind stays interactive.
export const ChatDialog = ({isOpen, onClose, children}: ChatDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogModeRef = useRef<DialogMode | null>(null);
  const isMobileViewport = useIsMobileViewport();
  const isMobile = isOpen && isMobileViewport;

  useScrollLock(isMobile);
  useTouchScrollGuard(dialogRef, isMobile);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!isOpen) {
      if (dialog.open) dialog.close();
      dialogModeRef.current = null;
      return;
    }

    const targetMode: DialogMode = isMobileViewport ? 'modal' : 'non-modal';

    if (!dialog.open) {
      if (isMobileViewport) dialog.showModal();
      else dialog.show();
      dialogModeRef.current = targetMode;
      return;
    }

    if (dialogModeRef.current !== targetMode) {
      dialog.close();
      if (isMobileViewport) dialog.showModal();
      else dialog.show();
      dialogModeRef.current = targetMode;
    }
  }, [isOpen, isMobileViewport]);

  // Mobile ESC - the cancel event only fires after showModal().
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  // Desktop ESC - non-modal dialogs don't fire cancel.
  useEffect(() => {
    if (!isOpen || isMobileViewport) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isMobileViewport]);

  // Track the visible viewport and keep the inner content aligned to it.
  // Dialog stays a static 100dvh shell so its white background covers the
  // layout-viewport area the keyboard hides. Inner content is sized to the
  // visible area and translated by visualViewport.offsetTop so the header
  // stays pinned at the top and the input rides the native iOS pan upward.

  // NOTE: Tested in Edge, Chrome, DuckDuckGo, Firefox, and Safari.
  // Works pretty much flawless everywhere except in Safari (the new IE).
  // The brief scuffed jump there is caused by the dynamic bottom toolbar animation.
  // If the toolbar is hidden, Safari works as a normal browser as well.
  useEffect(() => {
    if (!isMobile) return;

    const content = contentRef.current;
    const viewport = window.visualViewport;
    if (!content || !viewport) return;

    let rafId = 0;

    const syncViewport = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        content.style.height = `${viewport.height}px`;
        content.style.transform = `translateY(${viewport.offsetTop}px)`;
      });
    };

    syncViewport();
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);

    return () => {
      cancelAnimationFrame(rafId);
      viewport.removeEventListener('resize', syncViewport);
      viewport.removeEventListener('scroll', syncViewport);
      content.style.height = '';
      content.style.transform = '';
    };
  }, [isMobile]);

  return (
    <dialog
      ref={dialogRef}
      id='chat-widget-dialog'
      tabIndex={-1}
      aria-labelledby='chat-widget-title'
      className='fixed m-0 p-0 border-0 w-full max-w-none h-dvh max-h-dvh overflow-hidden bg-white text-slate-900 opacity-100 transform-none transition-none open:opacity-100 open:transform-none open:transition-none backdrop:bg-transparent max-md:inset-0 max-md:overscroll-none max-md:touch-none md:inset-auto md:top-auto md:right-6 md:bottom-8 md:left-auto md:rounded-2xl md:shadow-2xl md:border md:border-slate-200 md:w-[400px] md:h-[min(800px,calc(100dvh-3rem))]'
    >
      <div
        ref={contentRef}
        className='flex h-full min-h-0 flex-col bg-white'
      >
        {children}
      </div>
    </dialog>
  );
};
