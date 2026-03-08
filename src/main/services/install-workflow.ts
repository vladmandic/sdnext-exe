import fs from 'node:fs';
import path from 'node:path';
import type { InstallOptions, SdNextConfig, TerminalDimensions, UiStatus } from '../../shared/types';
import { ProcessRunner } from './process-runner';
import { ensureVenv } from './venv-service';
import { getPythonExecutablePath } from './runtime-paths';
import { ensurePortableRuntimes } from './portable-bootstrap';
import { debugLog } from './debug';
import { toBackendArgs, splitParameters, buildProcessEnvironment, runGit, runGitWithRetry, getCurrentBranch } from './workflow-common';
import { getCheckpointService } from './checkpoint-service';
import { runSandboxTest } from './sandbox-test-service';

const SDNEXT_REPO_URL = 'https://github.com/vladmandic/sdnext';


export async function runInstallWorkflow(
  runner: ProcessRunner,
  config: SdNextConfig,
  options: InstallOptions,
  onOutput: (text: string, isError?: boolean) => void,
  onStatus?: (status: UiStatus) => void,
  terminalDimensions?: TerminalDimensions,
): Promise<number> {
  debugLog('install', 'runInstallWorkflow invoked', {
    installationPath: config.installationPath,
    modelsPath: config.modelsPath,
    branch: config.repositoryBranch,
    options,
  });
  
  const checkpointSvc = getCheckpointService(config.installationPath);
  let checkpoint = checkpointSvc.loadCheckpoint();
  const isResume = checkpoint !== null;
  
  if (isResume && checkpoint) {
    onOutput(`[install] Resuming installation from checkpoint (last error: ${checkpoint.lastError || 'none'})\n`);
    debugLog('install', 'Resuming from checkpoint', { lastError: checkpoint.lastError });
  } else {
    checkpoint = checkpointSvc.createCheckpoint(config.installationPath);
    checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'start');
  }

  try {
    await ensurePortableRuntimes();

    const appPath = path.join(config.installationPath, 'app');

    if (options.wipe && fs.existsSync(config.installationPath)) {
      debugLog('install', 'Wipe requested, removing installation path', { installationPath: config.installationPath });
      onOutput('[install] Wipe selected, removing existing installation folder\n');
      fs.rmSync(config.installationPath, { recursive: true, force: true });
      checkpointSvc.clearCheckpoint();
      checkpoint = checkpointSvc.createCheckpoint(config.installationPath);
      await ensurePortableRuntimes();
    }

    fs.mkdirSync(appPath, { recursive: true });

    // Git Clone Step
    if (!checkpointSvc.isStepCompleted(checkpoint, 'git-clone')) {
      if (!fs.existsSync(path.join(appPath, '.git'))) {
        debugLog('install', 'Cloning repository', { appPath, branch: config.repositoryBranch });
        if (onStatus) onStatus('Cloning repository...');
        onOutput(`[git] Cloning ${SDNEXT_REPO_URL}\n`);
        const retryCount = config.gitRetryCount ?? 3;
        // use shallow clone to speed up downloads
        await runGitWithRetry(['clone', '--depth', '1', '--single-branch', '--branch', config.repositoryBranch, SDNEXT_REPO_URL, appPath], onOutput, retryCount);
      }
      checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'git-clone');
    } else {
      onOutput(`[install] Skipping git clone (already completed in previous attempt)\n`);
    }

    // Git Checkout Step
    if (!checkpointSvc.isStepCompleted(checkpoint, 'git-checkout')) {
      const currentBranch = getCurrentBranch(appPath);
      if (currentBranch === config.repositoryBranch) {
        onOutput(`[git] Already on branch ${config.repositoryBranch}, skipping checkout\n`);
        debugLog('install', 'Already on target branch, skipping checkout', { branch: config.repositoryBranch });
      } else {
        onOutput(`[git] Checking out branch ${config.repositoryBranch}\n`);
        debugLog('install', 'Checking out branch', { branch: config.repositoryBranch });
        runGit(['-C', appPath, 'checkout', config.repositoryBranch], onOutput);
      }
      checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'git-checkout');
    } else {
      onOutput(`[install] Skipping git checkout (already completed in previous attempt)\n`);
    }

    // VENV Creation Step
    if (!checkpointSvc.isStepCompleted(checkpoint, 'venv-created')) {
      if (onStatus) onStatus('Creating VENV...');
      ensureVenv(config.installationPath, getPythonExecutablePath(), onOutput);
      checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'venv-created');
    } else {
      onOutput(`[install] Skipping venv creation (already completed in previous attempt)\n`);
    }

    // Dependencies Installation Step
    if (!checkpointSvc.isStepCompleted(checkpoint, 'dependencies-installed')) {
      const venvPython = ensureVenv(config.installationPath, getPythonExecutablePath(), onOutput);
      const args = ['launch.py', '--test', '--log', 'install.log'];

      if (config.useUv) {
        args.push('--uv');
      }

      if (options.upgrade) {
        args.push('--upgrade');
      }
      if (options.forceReinstall || options.wipe) {
        args.push('--reinstall');
      }

      args.push('--models-dir', config.modelsPath, ...toBackendArgs(options.backend), ...splitParameters(config.customParameters));
      debugLog('install', 'Launching installer python command', { args, appPath });

      if (onStatus) onStatus('Installing dependencies...');
      const result = await runner.run({
        command: venvPython,
        args,
        cwd: appPath,
        env: buildProcessEnvironment(config),
        logFilePath: path.join(appPath, 'install.log'),
        onOutput,
        terminalCols: terminalDimensions?.cols,
        terminalRows: terminalDimensions?.rows,
      });
      
      if (result !== 0) {
        checkpointSvc.markError(checkpoint, `Installation failed with exit code ${result}`);
        return result;
      }
      
      checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'dependencies-installed');
    } else {
      onOutput(`[install] Skipping dependency installation (already completed in previous attempt)\n`);
    }

    // Mark complete and clear checkpoint on success
    // Run sandbox test before marking complete
    if (!checkpointSvc.isStepCompleted(checkpoint, 'sandbox-test-passed')) {
      onOutput('[install] Running sandbox test to verify installation...\n');
      const venvPython = ensureVenv(config.installationPath, getPythonExecutablePath(), onOutput);
      const testResult = runSandboxTest(venvPython);
      
      if (!testResult.healthy) {
        const errorMsg = `Sandbox test failed: ${testResult.errors.join('; ')}`;
        onOutput(`[install] ERROR: ${errorMsg}\n`, true);
        checkpointSvc.markError(checkpoint, errorMsg);
        return 1;
      }
      
      onOutput('[install] Sandbox test passed - venv is healthy\n');
      checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'sandbox-test-passed');
    } else {
      onOutput(`[install] Skipping sandbox test (already passed in previous attempt)\n`);
    }

    checkpoint = checkpointSvc.markStepCompleted(checkpoint, 'complete');
    checkpointSvc.clearCheckpoint();
    onOutput('[install] Installation completed successfully\n');
    return 0;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    checkpointSvc.markError(checkpoint, errorMsg);
    throw error;
  }
}
