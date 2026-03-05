import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { UiStatus } from '../../shared/types';
import {
  getBundledGitZipPath,
  getBundledPythonZipPath,
  getDefaultBinaryPath,
  getFallbackGitExecutablePath,
  getFallbackPythonExecutablePath,
  getPrimaryGitExecutablePath,
  getPrimaryPythonExecutablePath,
} from './runtime-paths';
import { debugLog } from './debug';

let initialized = false;
let bootstrapPromise: Promise<void> | null = null;
let bootstrapError: Error | null = null;
let onOutputCallback: ((text: string, isError?: boolean) => void) | null = null;
let onStatusCallback: ((status: UiStatus) => void) | null = null;

export function resetBootstrapState(): void {
  debugLog('bootstrap', 'Resetting bootstrap state');
  initialized = false;
  bootstrapPromise = null;
  bootstrapError = null;
}

export function setBootstrapOutputCallback(callback: (text: string, isError?: boolean) => void): void {
  onOutputCallback = callback;
}

export function setBootstrapStatusCallback(callback: (status: UiStatus) => void): void {
  onStatusCallback = callback;
}

export function cleanupPortableRuntimes(onLogOutput?: (text: string) => void): void {
  const logCleanup = (message: string): void => {
    debugLog('bootstrap', message);
    if (onLogOutput) {
      onLogOutput(`${message}\n`);
    }
  };

  logCleanup('Cleaning up existing portable runtimes for fresh extraction...');
  const primaryGit = getPrimaryGitExecutablePath();
  const fallbackGit = getFallbackGitExecutablePath();
  const primaryPython = getPrimaryPythonExecutablePath();
  const fallbackPython = getFallbackPythonExecutablePath();

  // Delete git directory if it exists
  const gitDir = path.dirname(primaryGit);
  if (fs.existsSync(gitDir)) {
    try {
      fs.rmSync(gitDir, { recursive: true, force: true });
      logCleanup(`Cleaned up git directory: ${gitDir}`);
    } catch (error) {
      logCleanup(`Failed to clean git directory: ${gitDir} - ${error}`);
    }
  }

  // Delete fallback git directory if different
  const fallbackGitDir = path.dirname(fallbackGit);
  if (fallbackGitDir !== gitDir && fs.existsSync(fallbackGitDir)) {
    try {
      fs.rmSync(fallbackGitDir, { recursive: true, force: true });
      logCleanup(`Cleaned up fallback git directory: ${fallbackGitDir}`);
    } catch (error) {
      logCleanup(`Failed to clean fallback git directory: ${fallbackGitDir} - ${error}`);
    }
  }

  // Delete python directory if it exists
  const pythonDir = path.dirname(primaryPython);
  if (fs.existsSync(pythonDir)) {
    try {
      fs.rmSync(pythonDir, { recursive: true, force: true });
      logCleanup(`Cleaned up python directory: ${pythonDir}`);
    } catch (error) {
      logCleanup(`Failed to clean python directory: ${pythonDir} - ${error}`);
    }
  }

  // Delete fallback python directory if different
  const fallbackPythonDir = path.dirname(fallbackPython);
  if (fallbackPythonDir !== pythonDir && fs.existsSync(fallbackPythonDir)) {
    try {
      fs.rmSync(fallbackPythonDir, { recursive: true, force: true });
      logCleanup(`Cleaned up fallback python directory: ${fallbackPythonDir}`);
    } catch (error) {
      logCleanup(`Failed to clean fallback python directory: ${fallbackPythonDir} - ${error}`);
    }
  }

  logCleanup('Cleanup complete, ready for fresh extraction.\n');
}

function logOutput(text: string, isError?: boolean): void {
  if (onOutputCallback) {
    onOutputCallback(text, isError);
  }
}

function logStatus(status: UiStatus): void {
  if (onStatusCallback) {
    onStatusCallback(status);
  }
}

async function runPowerShellExpandAsync(zipPath: string, destination: string): Promise<void> {
  debugLog('bootstrap', 'Expanding archive', { zipPath, destination });
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${destination}" -Force`,
      ],
      { windowsHide: true },
    );

    let stderr = '';
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Failed to extract ${path.basename(zipPath)}.`));
      } else {
        resolve();
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function findPythonDir(baseDir: string): string | null {
  const children = fs.existsSync(baseDir) ? fs.readdirSync(baseDir, { withFileTypes: true }) : [];
  for (const child of children) {
    if (!child.isDirectory()) {
      continue;
    }
    const candidate = path.join(baseDir, child.name, 'python.exe');
    if (fs.existsSync(candidate)) {
      return path.join(baseDir, child.name);
    }
  }
  return null;
}

function ensurePythonLayout(pythonBaseDir: string): void {
  const primaryPython = getPrimaryPythonExecutablePath();
  if (fs.existsSync(primaryPython)) {
    return;
  }

  const fallbackPython = getFallbackPythonExecutablePath();
  if (fs.existsSync(fallbackPython)) {
    fs.mkdirSync(path.dirname(primaryPython), { recursive: true });
    fs.copyFileSync(fallbackPython, primaryPython);
    return;
  }

  const discovered = findPythonDir(pythonBaseDir);
  if (!discovered) {
    return;
  }

  const normalized = path.join(pythonBaseDir, 'python');
  if (path.resolve(discovered) !== path.resolve(normalized)) {
    if (fs.existsSync(normalized)) {
      fs.rmSync(normalized, { recursive: true, force: true });
    }
    fs.renameSync(discovered, normalized);
  }
}

function hasPortableRuntimes(): boolean {
  const primaryGit = getPrimaryGitExecutablePath();
  const fallbackGit = getFallbackGitExecutablePath();
  const primaryPython = getPrimaryPythonExecutablePath();
  const fallbackPython = getFallbackPythonExecutablePath();

  const gitExists = fs.existsSync(primaryGit) || fs.existsSync(fallbackGit);
  const pythonExists = fs.existsSync(primaryPython) || fs.existsSync(fallbackPython);

  return gitExists && pythonExists;
}

export async function ensurePortableRuntimes(forceExtraction = false): Promise<void> {
  debugLog('bootstrap', 'ensurePortableRuntimes invoked', { forceExtraction });
  const primaryGit = getPrimaryGitExecutablePath();
  const fallbackGit = getFallbackGitExecutablePath();
  const primaryPython = getPrimaryPythonExecutablePath();
  const fallbackPython = getFallbackPythonExecutablePath();

  if (initialized && !forceExtraction) {
    if (hasPortableRuntimes()) {
      debugLog('bootstrap', 'Runtimes already initialized and available');
      return;
    }
    initialized = false;
  }

  logOutput('Starting bootstrap process...\n');
  const binaryDir = getDefaultBinaryPath();
  fs.mkdirSync(binaryDir, { recursive: true });

  // Extract Git
  if (forceExtraction || (!fs.existsSync(primaryGit) && !fs.existsSync(fallbackGit))) {
    logStatus('Unpacking Git...');
    logOutput('Unpacking bundled Git runtime...\n');
    const gitZip = getBundledGitZipPath();
    if (!fs.existsSync(gitZip)) {
      throw new Error(`Missing bundled git archive: ${gitZip}`);
    }
    const gitExtractDir = path.join(binaryDir, 'git');
    fs.mkdirSync(gitExtractDir, { recursive: true });
    await runPowerShellExpandAsync(gitZip, gitExtractDir);
    debugLog('bootstrap', 'Git extraction complete', { gitExtractDir });
    logOutput('Git runtime unpacked successfully.\n');
  } else {
    logOutput('Git runtime already available.\n');
  }

  // Extract Python
  if (forceExtraction || (!fs.existsSync(primaryPython) && !fs.existsSync(fallbackPython))) {
    logStatus('Unpacking Python...');
    logOutput('Unpacking bundled Python runtime...\n');
    const pythonZip = getBundledPythonZipPath();
    if (!fs.existsSync(pythonZip)) {
      throw new Error(`Missing bundled python archive: ${pythonZip}`);
    }
    const pythonExtractDir = path.join(binaryDir, 'python');
    fs.mkdirSync(pythonExtractDir, { recursive: true });
    await runPowerShellExpandAsync(pythonZip, pythonExtractDir);
    debugLog('bootstrap', 'Python extraction complete', { pythonExtractDir });
    logOutput('Python runtime unpacked successfully.\n');
  } else {
    logOutput('Python runtime already available.\n');
  }

  const pythonDir = path.join(binaryDir, 'python');
  ensurePythonLayout(pythonDir);

  if (!fs.existsSync(primaryGit) && !fs.existsSync(fallbackGit)) {
    throw new Error('Bundled Git was not found after extraction.');
  }
  if (!fs.existsSync(primaryPython) && !fs.existsSync(fallbackPython)) {
    throw new Error('Bundled Python was not found after extraction.');
  }

  logStatus('Bootstrap complete');
  logOutput('Bootstrap complete.\n');
  initialized = true;
  debugLog('bootstrap', 'Bootstrap completed successfully');
}

export function startBootstrapAsync(): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = ensurePortableRuntimes().catch((error) => {
    bootstrapError = error as Error;
    throw error;
  });

  return bootstrapPromise;
}

export function isBootstrapComplete(): boolean {
  if (!initialized && hasPortableRuntimes()) {
    // Restore bootstrap-complete state on fresh app runs when runtimes already exist on disk.
    initialized = true;
    bootstrapError = null;
  }

  return initialized;
}

export function getBootstrapError(): Error | null {
  return bootstrapError;
}
