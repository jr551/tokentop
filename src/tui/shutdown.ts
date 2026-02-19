type ShutdownFn = () => Promise<void>;

let _shutdown: ShutdownFn | null = null;
let _inProgress = false;

export function registerShutdown(fn: ShutdownFn): void {
  _shutdown = fn;
}

/** Safe to call multiple times — only the first invocation executes. */
export async function triggerShutdown(): Promise<void> {
  if (_inProgress) return;
  _inProgress = true;
  try {
    await _shutdown?.();
  } catch {
    /* swallow — don't let failed cleanup prevent exit */
  }
}
