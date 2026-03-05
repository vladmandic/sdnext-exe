const DEBUG_FLAG = '--debug';
const timers = new Map<string, number>();

export function isDebugEnabled(): boolean {
  return process.argv.includes(DEBUG_FLAG);
}

export function debugLog(scope: string, message: string, details?: unknown): void {
  if (!isDebugEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `${timestamp}:${scope}`;
  if (details !== undefined) {
    console.log(prefix, message, details);
    return;
  }
  console.log(prefix, message);
}

export function debugTimer(id: string): void {
  if (!isDebugEnabled()) {
    return;
  }
  timers.set(id, Date.now());
  console.log(`⏱️  [${id}] started`);
}

export function debugTimerEnd(id: string): number {
  if (!isDebugEnabled()) {
    return 0;
  }
  const startTime = timers.get(id);
  if (!startTime) {
    console.warn(`⏱️  [${id}] timer not found`);
    return 0;
  }
  const elapsed = Date.now() - startTime;
  timers.delete(id);
  console.log(`⏱️  [${id}] completed in ${elapsed}ms`);
  return elapsed;
}
