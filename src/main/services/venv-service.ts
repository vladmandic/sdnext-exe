import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function getVenvPythonPath(installationPath: string): string {
  return path.join(installationPath, 'venv', 'Scripts', 'python.exe');
}

export function ensureVenv(
  installationPath: string,
  portablePythonPath: string,
  onOutput: (text: string, isError?: boolean) => void,
): string {
  const venvPython = getVenvPythonPath(installationPath);
  if (fs.existsSync(venvPython)) {
    onOutput(`[venv] Using existing virtual environment: ${venvPython}\n`);
    return venvPython;
  }

  onOutput('[venv] Creating virtual environment at /venv\n');
  const result = spawnSync(portablePythonPath, ['-m', 'venv', path.join(installationPath, 'venv')], {
    cwd: installationPath,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.stdout) {
    onOutput(result.stdout);
  }
  if (result.stderr) {
    onOutput(result.stderr, true);
  }

  if (result.status !== 0 || !fs.existsSync(venvPython)) {
    throw new Error('Failed to create /venv using bundled python-portable.');
  }

  return venvPython;
}
