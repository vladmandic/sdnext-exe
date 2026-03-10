import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { debugLog } from './debug';
import {
  getFallbackGitExecutablePath,
  getFallbackPythonExecutablePath,
  getPrimaryGitExecutablePath,
  getPrimaryPythonExecutablePath,
} from './runtime-paths';

function resolveGitExe(installationPath?: string): string {
  const primary = getPrimaryGitExecutablePath(installationPath);
  const fallback = getFallbackGitExecutablePath(installationPath);
  return fs.existsSync(primary) ? primary : fallback;
}

function resolvePythonExe(installationPath?: string): string {
  const primary = getPrimaryPythonExecutablePath(installationPath);
  const fallback = getFallbackPythonExecutablePath(installationPath);
  return fs.existsSync(primary) ? primary : fallback;
}

export function getToolVersions(
  installationPath?: string,
  onError?: (message: string) => void,
): { git: string; python: string; gitOk: boolean; pythonOk: boolean } {
  const gitExe = resolveGitExe(installationPath);
  const pythonExe = resolvePythonExe(installationPath);

  let git = 'Unknown';
  let python = 'Unknown';
  let gitOk = false;
  let pythonOk = false;

  // Attempt to get git version
  const gitResult = spawnSync(gitExe, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (gitResult.error) {
    const gitError = `Git not found or not executable\nCommand: ${gitExe} --version\nError: ${gitResult.error.message}\n`;
    debugLog('tool-version', gitError);
    if (onError) {
      onError(gitError);
    }
  } else if (gitResult.status === 0) {
    gitOk = true;
    git = (gitResult.stdout || gitResult.stderr || '').trim() || 'Unknown';
  } else {
    const gitError = `Git version check failed\nCommand: ${gitExe} --version\nExit code: ${gitResult.status}\nOutput: ${(gitResult.stderr || gitResult.stdout || 'No output').trim()}\n`;
    debugLog('tool-version', gitError);
    if (onError) {
      onError(gitError);
    }
  }

  // Attempt to get python version
  const pyResult = spawnSync(pythonExe, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (pyResult.error) {
    const pythonError = `Python not found or not executable\nCommand: ${pythonExe} --version\nError: ${pyResult.error.message}\n`;
    debugLog('tool-version', pythonError);
    if (onError) {
      onError(pythonError);
    }
  } else if (pyResult.status === 0) {
    pythonOk = true;
    python = (pyResult.stdout || pyResult.stderr || '').trim() || 'Unknown';
  } else {
    const pythonError = `Python version check failed\nCommand: ${pythonExe} --version\nExit code: ${pyResult.status}\nOutput: ${(pyResult.stderr || pyResult.stdout || 'No output').trim()}\n`;
    debugLog('tool-version', pythonError);
    if (onError) {
      onError(pythonError);
    }
  }

  return { git, python, gitOk, pythonOk };
}
