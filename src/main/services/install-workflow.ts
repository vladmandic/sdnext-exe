import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { InstallOptions, SdNextConfig, TerminalDimensions, UiStatus } from '../../shared/types';
import { ProcessRunner } from './process-runner';
import { ensureVenv } from './venv-service';
import { getGitExecutablePath, getPythonExecutablePath } from './runtime-paths';
import { ensurePortableRuntimes } from './portable-bootstrap';
import { debugLog } from './debug';

const SDNEXT_REPO_URL = 'https://github.com/vladmandic/sdnext';

function toBackendArgs(backend: InstallOptions['backend']): string[] {
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

function splitParameters(params: string): string[] {
  return params
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseCustomEnvironment(custom: string): Record<string, string> {
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

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid custom environment variable name: ${key}`);
    }
    if (!value) {
      throw new Error(`Custom environment variable has empty value: ${key}`);
    }

    env[key] = value;
  }

  return env;
}

function runGit(args: string[], onOutput: (text: string, isError?: boolean) => void): void {
  const gitExe = getGitExecutablePath();
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

function buildProcessEnvironment(config: SdNextConfig): NodeJS.ProcessEnv {
  const extraEnv = parseCustomEnvironment(config.customEnvironment);
  const baseEnv = { ...process.env, ...extraEnv };

  const exeDir = path.dirname(getGitExecutablePath());
  const pythonDir = path.dirname(getPythonExecutablePath());
  baseEnv.PATH = `${exeDir};${pythonDir};${baseEnv.PATH ?? ''}`;

  // Enable color output and TTY compatibility
  baseEnv.FORCE_COLOR = '1';
  baseEnv.TTY_COMPATIBLE = '1';

  return baseEnv;
}

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
  await ensurePortableRuntimes();

  const appPath = path.join(config.installationPath, 'app');

  if (options.wipe && fs.existsSync(config.installationPath)) {
    debugLog('install', 'Wipe requested, removing installation path', { installationPath: config.installationPath });
    onOutput('[install] Wipe selected, removing existing installation folder\n');
    fs.rmSync(config.installationPath, { recursive: true, force: true });
    await ensurePortableRuntimes();
  }

  fs.mkdirSync(appPath, { recursive: true });

  if (!fs.existsSync(path.join(appPath, '.git'))) {
    debugLog('install', 'Cloning repository', { appPath, branch: config.repositoryBranch });
    if (onStatus) onStatus('Cloning repository...');
    onOutput(`[git] Cloning ${SDNEXT_REPO_URL}\n`);
    runGit(['clone', '--single-branch', '--branch', config.repositoryBranch, SDNEXT_REPO_URL, appPath], onOutput);
  }

  onOutput(`[git] Checking out branch ${config.repositoryBranch}\n`);
  debugLog('install', 'Checking out branch', { branch: config.repositoryBranch });
  runGit(['-C', appPath, 'checkout', config.repositoryBranch], onOutput);

  if (onStatus) onStatus('Creating VENV...');
  const venvPython = ensureVenv(config.installationPath, getPythonExecutablePath(), onOutput);
  const args = ['launch.py', '--test', '--uv', '--log', 'install.log'];

  if (options.upgrade) {
    args.push('--upgrade');
  }
  if (options.reinstall || options.wipe) {
    args.push('--reinstall');
  }

  args.push('--models-dir', config.modelsPath, ...toBackendArgs(options.backend), ...splitParameters(config.customParameters));
  debugLog('install', 'Launching installer python command', { args, appPath });

  if (onStatus) onStatus('Installing dependencies...');
  return runner.run({
    command: venvPython,
    args,
    cwd: appPath,
    env: buildProcessEnvironment(config),
    logFilePath: path.join(appPath, 'install.log'),
    onOutput,
    terminalCols: terminalDimensions?.cols,
    terminalRows: terminalDimensions?.rows,
  });
}
