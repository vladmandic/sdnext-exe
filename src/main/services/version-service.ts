import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { InstalledVersion } from '../../shared/types';
import { getGitExecutablePath } from './runtime-paths';

export function readInstalledVersion(installationPath: string): InstalledVersion | null {
  const appPath = path.join(installationPath, 'app');
  if (!fs.existsSync(appPath) || !fs.existsSync(path.join(appPath, '.git'))) {
    return null;
  }

  const gitExe = getGitExecutablePath(installationPath);
  if (!fs.existsSync(gitExe)) {
    return null;
  }

  const commit = spawnSync(gitExe, ['-C', appPath, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  const date = spawnSync(gitExe, ['-C', appPath, 'log', '-1', '--date=short', '--format=%cd'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (commit.status !== 0 || date.status !== 0) {
    return null;
  }

  const commitText = commit.stdout.trim();
  const dateText = date.stdout.trim();
  if (!commitText || !dateText) {
    return null;
  }

  return { commit: commitText, date: dateText };
}
