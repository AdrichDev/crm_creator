/**
 * back/src/lib/export-lock.ts
 *
 * In-process build lock.  Only one export build may run at a time.
 * The lock is a plain boolean; no external dependencies required.
 *
 * RF-07: 409 if a build is already running.
 * RF-08: 20-minute watchdog aborts a stalled build.
 *
 * NOTE: signals are combined manually — AbortSignal.any() is NOT used (RNF-06).
 */

let isBuildRunning = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Try to acquire the build lock.
 * Returns true if the lock was acquired, false if a build is already running.
 */
export function acquireLock(): boolean {
  if (isBuildRunning) return false;
  isBuildRunning = true;
  return true;
}

/**
 * Release the build lock unconditionally.
 * Safe to call multiple times (idempotent).
 */
export function releaseLock(): void {
  isBuildRunning = false;
}

/**
 * Start a 20-minute watchdog timer.
 * When it fires: calls releaseLock() then onTimeout().
 * If the provided AbortController is aborted first, the watchdog is cancelled.
 *
 * @param controller - AbortController whose signal belongs to the running build.
 *                     When aborted externally the watchdog clears itself.
 * @param onTimeout  - Callback invoked when the 20-minute deadline is exceeded.
 */
export function startWatchdog(
  controller: AbortController,
  onTimeout: () => void,
): void {
  const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

  let fired = false;

  const timer = setTimeout(() => {
    if (fired) return;
    fired = true;
    releaseLock();
    onTimeout();
  }, TIMEOUT_MS);

  // Manual signal combination (not AbortSignal.any).
  // When the build is cancelled externally we simply clear the watchdog timer.
  const onAbort = (): void => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
  };

  controller.signal.addEventListener('abort', onAbort, { once: true });
}
