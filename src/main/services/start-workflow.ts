import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SdNextConfig, TerminalDimensions } from '../../shared/types';
import { ProcessRunner } from './process-runner';
import { getGitExecutablePath, getPythonExecutablePath } from './runtime-paths';
import { getVenvPythonPath } from './venv-service';
import { ensurePortableRuntimes } from './portable-bootstrap';
import { debugLog } from './debug';

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

  const gitDir = path.dirname(getGitExecutablePath());
  const pythonDir = path.dirname(getPythonExecutablePath());
  baseEnv.PATH = `${gitDir};${pythonDir};${baseEnv.PATH ?? ''}`;

  // Enable color output and TTY compatibility
  baseEnv.FORCE_COLOR = '1';
  baseEnv.TTY_COMPATIBLE = '1';

  return baseEnv;
}

export async function runStartWorkflow(
  runner: ProcessRunner,
  config: SdNextConfig,
  onOutput: (text: string, isError?: boolean) => void,
  terminalDimensions?: TerminalDimensions,
): Promise<number> {
  debugLog('start', 'runStartWorkflow invoked', {
    installationPath: config.installationPath,
    modelsPath: config.modelsPath,
    branch: config.repositoryBranch,
    autoLaunch: config.autoLaunch,
  });
  await ensurePortableRuntimes();

  const appPath = path.join(config.installationPath, 'app');
  const venvPython = getVenvPythonPath(config.installationPath);

  if (!fs.existsSync(venvPython)) {
    debugLog('start', 'Missing venv python executable', { venvPython });
    throw new Error('Application is not installed: /venv is missing. Run installer first.');
  }

  onOutput(`[git] Checking out branch ${config.repositoryBranch}\n`);
  debugLog('start', 'Checking out branch', { branch: config.repositoryBranch });
  runGit(['-C', appPath, 'checkout', config.repositoryBranch], onOutput);

  const args = ['launch.py', '--uv', '--log', 'sdnext.log', '--models-dir', config.modelsPath];
  if (config.autoLaunch) {
    args.push('--autolaunch');
  }
  args.push(...splitParameters(config.customParameters));
  debugLog('start', 'Launching start python command', { args, appPath });

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
