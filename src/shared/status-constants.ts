/**
 * Centralized status message constants
 * Used across IPC communication to ensure consistency
 */

export const STATUS = {
  IDLE: 'Idle' as const,
  BOOTSTRAPPING: 'Bootstrapping...' as const,
  BOOTSTRAP_COMPLETE: 'Bootstrap complete' as const,
  INITIALIZING: 'Initializing...' as const,
  LAUNCHING: 'Launching...' as const,
  READY: 'Ready...' as const,
  
  // Bootstrap sub-statuses (used in renderer)
  UNPACKING_GIT: 'Unpacking Git...' as const,
  EXTRACTING_GIT: 'Extracting Git archive...' as const,
  VERIFYING_GIT: 'Verifying Git installation...' as const,
  UNPACKING_PYTHON: 'Unpacking Python...' as const,
  EXTRACTING_PYTHON: 'Extracting Python archive...' as const,
  VERIFYING_PYTHON: 'Verifying Python installation...' as const,
} as const;

export type StatusValue = typeof STATUS[keyof typeof STATUS];

/**
 * Formats an error message with the standard "Error: " prefix
 * @param message - The error message to format
 * @returns Formatted error string
 */
export function formatError(message: string): string {
  return `Error: ${message}`;
}

/**
 * Formats an install failure message with exit code
 * @param code - The exit code from the failed install
 * @returns Formatted error string
 */
export function formatInstallError(code: number): string {
  return `Error: Install failed with exit code ${code}`;
}

/**
 * Formats a bootstrap requirement error for missing tools
 * @param missingTools - Array of tool names that are unavailable
 * @returns Formatted error string
 */
export function formatBootstrapRequired(missingTools: string[]): string {
  return `Error: ${missingTools.join(' & ')} unavailable | Bootstrap required`;
}

/**
 * Formats an operation conflict message
 * @param operation - The operation currently in progress
 * @returns Formatted error string
 */
export function formatOperationInProgress(operation: string): string {
  return `Cannot perform operation while ${operation} is in progress`;
}
