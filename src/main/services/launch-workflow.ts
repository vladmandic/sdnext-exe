import fs from 'node:fs';
import path from 'node:path';
import type { SdNextConfig, TerminalDimensions } from '../../shared/types';
import { ProcessRunner } from './process-runner';
import { getVenvPythonPath } from './venv-service';
import { ensurePortableRuntimes } from './portable-bootstrap';
import { debugLog } from './debug';
import { splitParameters, buildProcessEnvironment, runGit, getCurrentBranch } from './workflow-common';

export async function runLaunchWorkflow(
  runner: ProcessRunner,
  config: SdNextConfig,
  onOutput: (text: string, isError?: boolean) => void,
  terminalDimensions?: TerminalDimensions,
): Promise<number> {
  debugLog('launch', 'runLaunchWorkflow invoked', {
    installationPath: config.installationPath,
    modelsPath: config.modelsPath,
    branch: config.repositoryBranch,
    autoLaunch: config.autoLaunch,
  });
  await ensurePortableRuntimes(false, config.installationPath);

  const appPath = path.join(config.installationPath, 'app');
  const venvPython = getVenvPythonPath(config.installationPath);

  if (!fs.existsSync(venvPython)) {
    debugLog('launch', 'Missing venv python executable', { venvPython });
    throw new Error('Application is not installed: /venv is missing. Run installer first.');
  }

  const currentBranch = getCurrentBranch(appPath, config.installationPath);
  if (currentBranch === config.repositoryBranch) {
    onOutput(`[git] Already on branch ${config.repositoryBranch}, skipping checkout\n`);
    debugLog('launch', 'Already on target branch, skipping checkout', { branch: config.repositoryBranch });
  } else {
    onOutput(`[git] Checking out branch ${config.repositoryBranch}\n`);
    debugLog('launch', 'Checking out branch', { branch: config.repositoryBranch, currentBranch: currentBranch ?? 'unknown' });
    runGit(['-C', appPath, 'checkout', config.repositoryBranch], onOutput, config.installationPath);
  }

  const args = ['launch.py', '--log', 'sdnext.log', '--models-dir', config.modelsPath];
  if (config.useUv) {
    args.push('--uv');
  }
  if (config.autoLaunch) {
    args.push('--autolaunch');
  }
  if (config.public) {
    args.push('--listen');
  }
  args.push(...splitParameters(config.customParameters));
  debugLog('launch', 'Launching start python command', { args, appPath });

  return runner.run({
    command: venvPython,
    args,
    cwd: appPath,
    env: buildProcessEnvironment(config),
    logFilePath: path.join(appPath, 'sdnext.log'),
    onOutput,
    terminalCols: terminalDimensions?.cols,
    terminalRows: terminalDimensions?.rows,
  });
}
