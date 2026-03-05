import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { debugLog } from './debug';
import {
  getFallbackGitExecutablePath,
  getFallbackPythonExecutablePath,
  getPrimaryGitExecutablePath,
  getPrimaryPythonExecutablePath,
} from './runtime-paths';

function resolveGitExe(): string {
  return fs.existsSync(getPrimaryGitExecutablePath()) ? getPrimaryGitExecutablePath() : getFallbackGitExecutablePath();
}

function resolvePythonExe(): string {
  return fs.existsSync(getPrimaryPythonExecutablePath()) ? getPrimaryPythonExecutablePath() : getFallbackPythonExecutablePath();
}

export function getToolVersions(
  onError?: (message: string) => void,
): { git: string; python: string; gitOk: boolean; pythonOk: boolean } {
  const gitExe = resolveGitExe();
  const pythonExe = resolvePythonExe();

  let git = 'Unknown';
  let python = 'Unknown';
  let gitOk = false;
  let pythonOk = false;

  // Attempt to get git version
  const gitResult = spawnSync(gitExe, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (gitResult.status === 0) {
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
  if (pyResult.status === 0) {
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
