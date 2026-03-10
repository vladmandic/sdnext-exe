import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { SdNextConfig, InstallOptions } from '../../shared/types';
import { validateEnvVarName } from '../../shared/types';
import { getGitExecutablePath, getPythonExecutablePath } from './runtime-paths';

/**
 * Convert compute backend option to launch.py command-line arguments
 * @param backend Backend type
 * @returns Array of backend-specific arguments
 */
export function toBackendArgs(backend: InstallOptions['backend']): string[] {
  switch (backend) {
    case 'autodetect':
      return [];
    case 'cuda':
      return ['--use-cuda'];
    case 'rocm':
      return ['--use-rocm'];
    case 'zluda':
      return ['--use-zluda'];
    case 'directml':
      return ['--use-directml'];
    case 'ipex':
      return ['--use-ipex'];
    case 'openvino':
      return ['--use-openvino'];
    default:
      return [];
  }
}

/**
 * Split space-delimited parameter string into array
 * @param params Space-delimited string of parameters
 * @returns Array of trimmed, non-empty parameters
 */
export function splitParameters(params: string): string[] {
  return params
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Parse custom environment variables from string format
 * Supports VAR=value and VAR="quoted value" formats
 * @param custom Environment variable string (space, comma, or semicolon delimited)
 * @returns Object mapping variable names to values
 * @throws Error if format is invalid or variable names don't match [A-Za-z_][A-Za-z0-9_]*
 */
export function parseCustomEnvironment(custom: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!custom.trim()) {
    return env;
  }

  // Parse entries respecting quoted values (e.g., VAR="value with spaces")
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < custom.length; i++) {
    const char = custom[i];
    
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
      current += char;
    } else if ([' ', ',', ';', '\t', '\n'].includes(char) && !inQuotes) {
      if (current.trim()) {
        entries.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    entries.push(current.trim());
  }

  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid custom environment token: ${entry}`);
    }

    const key = entry.slice(0, eq).trim();
    let value = entry.slice(eq + 1).trim();

    // Remove surrounding quotes from value if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Validate environment variable name using branded type validator
    try {
      validateEnvVarName(key);
    } catch {
      throw new Error(`Invalid custom environment variable name: ${key}`);
    }
    
    if (!value) {
      throw new Error(`Custom environment variable has empty value: ${key}`);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Run a git command synchronously
 * @param args Git command arguments
 * @param onOutput Callback for stdout/stderr lines
 * @throws Error if git command returns non-zero status
 */
export function runGit(
  args: string[],
  onOutput: (text: string, isError?: boolean) => void,
  installationPath?: string,
): void {
  const gitExe = getGitExecutablePath(installationPath);
  const result = spawnSync(gitExe, args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.stdout) {
    onOutput(result.stdout);
  }
  if (result.stderr) {
    onOutput(result.stderr, true);
  }

  if (result.status !== 0) {
    throw new Error(`Git command failed: ${args.join(' ')}`);
  }
}

/**
 * Run a git command with exponential backoff retry logic
 * @param args Git command arguments
 * @param onOutput Callback for stdout/stderr lines
 * @param maxRetries Maximum number of retries (default: 3)
 * @param initialWaitMs Initial wait time in milliseconds (default: 5000)
 * @throws Error if all retries fail
 */
export async function runGitWithRetry(
  args: string[],
  onOutput: (text: string, isError?: boolean) => void,
  installationPath?: string,
  maxRetries: number = 3,
  initialWaitMs: number = 5000,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      runGit(args, onOutput, installationPath);
      return; // Success - exit early
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitMs = initialWaitMs * Math.pow(2, attempt); // Exponential backoff
        onOutput(`[git] Attempt ${attempt + 1} failed, retrying in ${waitMs}ms...\n`, true);
        
        // CRITICAL FIX: Use async setTimeout instead of Atomics.wait (which doesn't work on main thread)
        // This allows the event loop to continue processing while waiting
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError || new Error(`Git command failed after ${maxRetries} retries: ${args.join(' ')}`);
}

/**
 * Get the current branch name for a git repository
 * @param repoPath Path to git repository
 * @returns Current branch name, or null if unable to determine
 */
export function getCurrentBranch(repoPath: string, installationPath?: string): string | null {
  try {
    const gitExe = getGitExecutablePath(installationPath);
    const result = spawnSync(gitExe, ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // Return null if unable to get branch
  }

  return null;
}

/**
 * Build process environment for workflow execution
 * Merges custom environment variables and ensures Git/Python in PATH
 * @param config Configuration including customEnvironment field
 * @returns NodeJS ProcessEnv suitable for process execution
 */
export function buildProcessEnvironment(config: SdNextConfig): NodeJS.ProcessEnv {
  const extraEnv = parseCustomEnvironment(config.customEnvironment);
  const baseEnv = { ...process.env, ...extraEnv };

  const exeDir = path.dirname(getGitExecutablePath(config.installationPath));
  const pythonDir = path.dirname(getPythonExecutablePath(config.installationPath));
  // Use semicolon on Windows, colon on Unix
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  baseEnv.PATH = `${exeDir}${pathSeparator}${pythonDir}${pathSeparator}${baseEnv.PATH ?? ''}`;

  // Enable color output and TTY compatibility
  baseEnv.FORCE_COLOR = '1';
  baseEnv.TTY_COMPATIBLE = '1';

  // Mark python child processes as launched by this Electron launcher.
  baseEnv.SD_LAUNCHER = 'true';

  return baseEnv;
}
