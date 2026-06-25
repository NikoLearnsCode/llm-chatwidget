export const DESKTOP_MIN_WIDTH = 768;
export const MOBILE_MEDIA_QUERY = `(max-width: ${DESKTOP_MIN_WIDTH - 1}px)`;

export function isMobileViewport() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function isDesktopViewport() {
  return !isMobileViewport();
}
