import {useEffect, useState} from 'react';
import {MOBILE_MEDIA_QUERY} from '@/lib/viewport';

/** Tracks the mobile breakpoint (below `DESKTOP_MIN_WIDTH`), reacting to live resizes. */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
