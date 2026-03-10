import fs from 'node:fs';
import path from 'node:path';
import extract from 'extract-zip';
import type { UiStatus, ExtractionProgressEvent } from '../../shared/types';
import {
  getBundledGitZipPath,
  getBundledPythonZipPath,
  getFallbackGitExecutablePath,
  getFallbackPythonExecutablePath,
  getPrimaryGitExecutablePath,
  getPrimaryPythonExecutablePath,
  getBinaryPath,
} from './runtime-paths';
import { debugLog } from './debug';

let initialized = false;
let bootstrapPromise: Promise<void> | null = null;
let bootstrapError: Error | null = null;
let onOutputCallback: ((text: string, isError?: boolean) => void) | null = null;
let onStatusCallback: ((status: UiStatus) => void) | null = null;
let _onProgressCallback: ((progress: ExtractionProgressEvent) => void) | null = null;
let _abortSignal: AbortSignal | null = null;

/**
 * Reset bootstrap state, clearing any cached promises or errors
 */
export function resetBootstrapState(): void {
  debugLog('bootstrap', 'Resetting bootstrap state');
  // Abort any in-flight bootstrap before resetting
  const controller = (globalThis as unknown as { bootstrapAbortController?: AbortController }).bootstrapAbortController;
  if (controller && !controller.signal.aborted) {
    debugLog('bootstrap', 'Aborting in-flight bootstrap before reset');
    controller.abort();
  }
  initialized = false;
  bootstrapPromise = null;
  bootstrapError = null;
  _abortSignal = null;
}

/**
 * Request bootstrap abortion via abort signal
 */
export function abortBootstrap(): void {
  debugLog('bootstrap', 'Abort requested');
  const controller = (globalThis as unknown as { bootstrapAbortController?: AbortController }).bootstrapAbortController;
  if (controller && !controller.signal.aborted) {
    controller.abort();
  }
}

/**
 * Set callback for bootstrap output messages
 */
export function setBootstrapOutputCallback(callback: (text: string, isError?: boolean) => void): void {
  onOutputCallback = callback;
}

/**
 * Set callback for bootstrap status updates
 */
export function setBootstrapStatusCallback(callback: (status: UiStatus) => void): void {
  onStatusCallback = callback;
}

/**
 * Set callback for extraction progress updates
 */
export function setBootstrapProgressCallback(callback: (progress: ExtractionProgressEvent) => void): void {
  _onProgressCallback = callback;
}

export function cleanupPortableRuntimes(installationPath?: string, onLogOutput?: (text: string) => void): void {
  const logCleanup = (message: string): void => {
    debugLog('bootstrap', message);
    if (onLogOutput) {
      onLogOutput(`${message}\n`);
    }
  };

  logCleanup('Cleaning up existing portable runtimes for fresh extraction...');
  const primaryGit = getPrimaryGitExecutablePath(installationPath);
  const fallbackGit = getFallbackGitExecutablePath(installationPath);
  const primaryPython = getPrimaryPythonExecutablePath(installationPath);
  const fallbackPython = getFallbackPythonExecutablePath(installationPath);

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

interface ExtractionProgress {
  name: string;
  filesExtracted: number;
  totalFiles?: number;
}

async function extractZipAsync(
  zipPath: string,
  destination: string,
  onProgress?: (progress: ExtractionProgress) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  const zipName = path.basename(zipPath);
  debugLog('bootstrap', 'Extracting archive with extract-zip', { zipPath, destination });
  
  let filesExtracted = 0;
  
  try {
    await extract(zipPath, {
      dir: destination,
      onEntry: () => {
        // Check abort signal during extraction
        if (abortSignal?.aborted) {
          throw new Error('Bootstrap aborted by user');
        }
        filesExtracted += 1;
        if (onProgress) {
          onProgress({
            name: zipName,
            filesExtracted,
          });
        }
        // Log progress every 100 files to avoid noise
        if (filesExtracted % 100 === 0) {
          debugLog('bootstrap', `Extracted ${filesExtracted} files from ${zipName}`);
        }
      },
    });
    debugLog('bootstrap', 'Archive extraction complete', { zipPath, filesExtracted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract ${zipName}: ${msg}`);
  }
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

function hasPortableRuntimes(installationPath?: string): boolean {
  const primaryGit = getPrimaryGitExecutablePath(installationPath);
  const fallbackGit = getFallbackGitExecutablePath(installationPath);
  const primaryPython = getPrimaryPythonExecutablePath(installationPath);
  const fallbackPython = getFallbackPythonExecutablePath(installationPath);

  const gitExists = fs.existsSync(primaryGit) || fs.existsSync(fallbackGit);
  const pythonExists = fs.existsSync(primaryPython) || fs.existsSync(fallbackPython);

  return gitExists && pythonExists;
}

/**
 * Ensure bundled Git and Python runtimes are extracted and available
 * @param forceExtraction If true, re-extract even if runtimes already exist
 */
export async function ensurePortableRuntimes(forceExtraction = false, installationPath?: string): Promise<void> {
  debugLog('bootstrap', 'ensurePortableRuntimes invoked', { forceExtraction, installationPath });
  
  // Portable runtimes are only available on Windows
  if (process.platform !== 'win32') {
    debugLog('bootstrap', 'Portable runtimes not available on non-Windows platforms');
    throw new Error('Portable runtimes are only available on Windows. Please use system git and python.');
  }
  
  const primaryGit = getPrimaryGitExecutablePath(installationPath);
  const fallbackGit = getFallbackGitExecutablePath(installationPath);
  const primaryPython = getPrimaryPythonExecutablePath(installationPath);
  const fallbackPython = getFallbackPythonExecutablePath(installationPath);

  if (initialized && !forceExtraction) {
    if (hasPortableRuntimes(installationPath)) {
      debugLog('bootstrap', 'Runtimes already initialized and available');
      return;
    }
    initialized = false;
  }

  // Create abort controller for this bootstrap session
  const abortController = new AbortController();
  (globalThis as unknown as { bootstrapAbortController?: AbortController }).bootstrapAbortController = abortController;

  logOutput('Starting bootstrap process...\n');
  const binaryDir = getBinaryPath(installationPath);
  fs.mkdirSync(binaryDir, { recursive: true });

  // Prepare extraction tasks
  const extractionTasks: Promise<void>[] = [];
  const gitNeedsExtraction = forceExtraction || (!fs.existsSync(primaryGit) && !fs.existsSync(fallbackGit));
  const pythonNeedsExtraction = forceExtraction || (!fs.existsSync(primaryPython) && !fs.existsSync(fallbackPython));

  let gitProgress: ExtractionProgress = { name: 'git', filesExtracted: 0 };
  let pythonProgress: ExtractionProgress = { name: 'python', filesExtracted: 0 };
  let lastProgressEventTime = Date.now();

  const handleProgress = (): void => {
    const now = Date.now();
    
    // Send realtime progress events to UI every 100ms (for UI progress bar only)
    if (now - lastProgressEventTime >= 100 && _onProgressCallback) {
      lastProgressEventTime = now;
      _onProgressCallback({
        git: gitNeedsExtraction ? { filesExtracted: gitProgress.filesExtracted } : undefined,
        python: pythonNeedsExtraction ? { filesExtracted: pythonProgress.filesExtracted } : undefined,
      });
    }
    
    // DO NOT output progress to terminal - only UI progress bar displays extraction metrics
  };

  // Extract Git in parallel
  if (gitNeedsExtraction) {
    logStatus('Unpacking Git...');
    logOutput('Unpacking bundled Git runtime...\n');
    const gitZip = getBundledGitZipPath();
    if (!fs.existsSync(gitZip)) {
      throw new Error(`Missing bundled git archive: ${gitZip}`);
    }
    const gitExtractDir = path.join(binaryDir, 'git');
    fs.mkdirSync(gitExtractDir, { recursive: true });

    extractionTasks.push(
      extractZipAsync(gitZip, gitExtractDir, (progress) => {
        gitProgress = progress;
        handleProgress();
      }, abortController.signal).then(() => {
        debugLog('bootstrap', 'Git extraction complete', { gitExtractDir });
        logStatus('Verifying Git installation...');
        logOutput('Git runtime unpacked successfully.\n');
        // Send final progress update to UI
        if (_onProgressCallback) {
          _onProgressCallback({
            git: { filesExtracted: gitProgress.filesExtracted },
            python: pythonNeedsExtraction ? { filesExtracted: pythonProgress.filesExtracted } : undefined,
          });
        }
      }),
    );
  } else {
    logOutput('Git runtime already available.\n');
  }

  // Extract Python in parallel
  if (pythonNeedsExtraction) {
    logStatus('Unpacking Python...');
    logOutput('Unpacking bundled Python runtime...\n');
    const pythonZip = getBundledPythonZipPath();
    if (!fs.existsSync(pythonZip)) {
      throw new Error(`Missing bundled python archive: ${pythonZip}`);
    }
    const pythonExtractDir = path.join(binaryDir, 'python');
    fs.mkdirSync(pythonExtractDir, { recursive: true });

    extractionTasks.push(
      extractZipAsync(pythonZip, pythonExtractDir, (progress) => {
        pythonProgress = progress;
        handleProgress();
      }, abortController.signal).then(() => {
        debugLog('bootstrap', 'Python extraction complete', { pythonExtractDir });
        logStatus('Verifying Python installation...');
        logOutput('Python runtime unpacked successfully.\n');
        // Send final progress update to UI
        if (_onProgressCallback) {
          _onProgressCallback({
            git: gitNeedsExtraction ? { filesExtracted: gitProgress.filesExtracted } : undefined,
            python: { filesExtracted: pythonProgress.filesExtracted },
          });
        }
      }),
    );
  } else {
    logOutput('Python runtime already available.\n');
  }

  // Wait for both extractions to complete in parallel
  if (extractionTasks.length > 0) {
    // Check for abort before proceeding
    if (abortController.signal.aborted) {
      throw new Error('Bootstrap aborted by user');
    }
    try {
      await Promise.all(extractionTasks);
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Bootstrap aborted by user');
      }
      throw error;
    }
    logOutput('Extraction complete.\n');
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
  
  // Clean up abort controller
  (globalThis as unknown as { bootstrapAbortController?: AbortController | null }).bootstrapAbortController = null;
}

/**
 * Start bootstrap process asynchronously (idempotent - returns stored promise if already running)
 */
export function startBootstrapAsync(installationPath?: string): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = ensurePortableRuntimes(false, installationPath).catch((error) => {
    bootstrapError = error as Error;
    // Clean up abort controller on error
    (globalThis as unknown as { bootstrapAbortController?: AbortController | null }).bootstrapAbortController = null;
    throw error;
  });

  return bootstrapPromise;
}

/**
 * Check if bootstrap process has completed successfully
 */
export function isBootstrapComplete(installationPath?: string): boolean {
  if (!initialized && hasPortableRuntimes(installationPath)) {
    // Restore bootstrap-complete state on fresh app runs when runtimes already exist on disk.
    initialized = true;
    bootstrapError = null;
  }

  return initialized;
}

/**
 * Get any error that occurred during bootstrap
 */
export function getBootstrapError(): Error | null {
  return bootstrapError;
}
