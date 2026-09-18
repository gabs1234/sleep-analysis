export const OPEN_LOG_COMPOSER_EVENT = "open-log-composer";

const PENDING_REQUEST_KEY = "sleep-journal:open-log-composer";

export function requestLogComposerOpen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_REQUEST_KEY, String(Date.now()));
  } catch {
    // The hash and live event remain available when session storage is blocked.
  }
  window.dispatchEvent(new Event(OPEN_LOG_COMPOSER_EVENT));
}

export function consumeLogComposerRequest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pending = window.sessionStorage.getItem(PENDING_REQUEST_KEY) !== null;
    if (pending) window.sessionStorage.removeItem(PENDING_REQUEST_KEY);
    return pending;
  } catch {
    return false;
  }
}
