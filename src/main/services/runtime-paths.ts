import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

function getExecutableDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (!app.isPackaged) {
    return process.cwd();
  }
  return path.dirname(app.getPath('exe'));
}

function getResourcesDir(): string {
  return process.resourcesPath;
}

export function getPortableBaseDir(): string {
  if (app.isPackaged) {
    return path.join(getResourcesDir(), 'portable');
  }
  return path.join(getExecutableDir(), 'portable');
}

export function getDefaultInstallationPath(): string {
  return path.join(getExecutableDir(), 'sdnext');
}

export function getDefaultBinaryPath(): string {
  return path.join(getDefaultInstallationPath(), 'bin');
}

export function getDefaultModelsPath(installationPath: string): string {
  return path.join(installationPath, 'app', 'models');
}

export function getLogoPath(): string {
  if (app.isPackaged) {
    return path.join(getResourcesDir(), 'sdnext.png');
  }
  return path.join(getExecutableDir(), 'public', 'sdnext.png');
}

export function getWindowIconPath(): string {
  if (app.isPackaged) {
    return path.join(getResourcesDir(), 'logo.png');
  }
  return path.join(getExecutableDir(), 'public', 'logo.png');
}

export function getConfigPath(): string {
  return path.join(getExecutableDir(), 'sdnext.json');
}

export function getBundledGitZipPath(): string {
  return path.join(getPortableBaseDir(), 'nuget-git-2.53.0.zip');
}

export function getBundledPythonZipPath(): string {
  return path.join(getPortableBaseDir(), 'python-3.13.12.zip');
}

export function getPrimaryGitExecutablePath(): string {
  return path.join(getDefaultBinaryPath(), 'git', 'git.exe');
}

export function getFallbackGitExecutablePath(): string {
  return path.join(getDefaultBinaryPath(), 'git', 'cmd', 'git.exe');
}

export function getPrimaryPythonExecutablePath(): string {
  return path.join(getDefaultBinaryPath(), 'python', 'python.exe');
}

export function getFallbackPythonExecutablePath(): string {
  return path.join(getDefaultBinaryPath(), 'python', 'python.exe');
}

export function getGitExecutablePath(): string {
  return fs.existsSync(getPrimaryGitExecutablePath()) ? getPrimaryGitExecutablePath() : getFallbackGitExecutablePath();
}

export function getPythonExecutablePath(): string {
  return fs.existsSync(getPrimaryPythonExecutablePath()) ? getPrimaryPythonExecutablePath() : getFallbackPythonExecutablePath();
}
