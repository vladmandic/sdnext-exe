import fs from 'node:fs';
import path from 'node:path';
import { spawn as spawnPty, type IPty } from 'node-pty';
import { killProcessTree } from './process-termination';
import { debugLog } from './debug';

export interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logFilePath: string;
  onOutput: (chunk: string, isError?: boolean) => void;
  terminalCols?: number;
  terminalRows?: number;
}

export class ProcessRunner {
  private activeChild: IPty | null = null;
  private wasStopped = false;

  public get isRunning(): boolean {
    return this.activeChild !== null;
  }

  async run(input: RunProcessInput): Promise<number> {
    debugLog('process-runner', 'run invoked', {
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      logFilePath: input.logFilePath,
    });
    if (this.activeChild) {
      throw new Error('Another process is already running.');
    }

    fs.mkdirSync(path.dirname(input.logFilePath), { recursive: true });
    const logStream = fs.createWriteStream(input.logFilePath, { flags: 'a' });

    return new Promise<number>((resolve) => {
      // Enhance environment with terminal settings for color output
      const enhancedEnv = { ...input.env };
      
      // Set terminal dimensions
      if (input.terminalCols) {
        enhancedEnv.COLUMNS = String(input.terminalCols);
      }
      if (input.terminalRows) {
        enhancedEnv.LINES = String(input.terminalRows);
      }
      
      // Enable color output for Python and other tools
      enhancedEnv.TERM = 'xterm-256color';
      enhancedEnv.COLORTERM = 'truecolor';
      enhancedEnv.FORCE_COLOR = '1';
      enhancedEnv.TTY_COMPATIBLE = '1';
      enhancedEnv.PYTHONUNBUFFERED = '1';
      // For libraries that check for TTY
      enhancedEnv.TERM_PROGRAM = 'xterm';

      // Use node-pty to spawn process with real PTY (enables isatty() for color output)
      const ptyProcess = spawnPty(input.command, input.args, {
        name: 'xterm-256color',
        cols: input.terminalCols ?? 80,
        rows: input.terminalRows ?? 24,
        cwd: input.cwd,
        env: enhancedEnv,
        useConpty: true,  // Use Windows ConPTY for better compatibility
        conptyInheritCursor: false,
      });

      this.activeChild = ptyProcess;
      this.wasStopped = false;
      debugLog('process-runner', 'child process started with PTY', { pid: ptyProcess.pid });

      // Forward output and log it
      ptyProcess.onData((data) => {
        logStream.write(data);
        input.onOutput(data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        debugLog('process-runner', 'child process closed', { code: exitCode, wasStopped: this.wasStopped });
        this.activeChild = null;
        logStream.end();
        // If process was explicitly stopped, return success to avoid error status
        resolve(this.wasStopped ? 0 : exitCode);
      });
    });
  }

  async stop(): Promise<void> {
    debugLog('process-runner', 'stop invoked', { pid: this.activeChild?.pid });
    if (!this.activeChild?.pid) {
      return;
    }
    this.wasStopped = true;
    const pid = this.activeChild.pid;
    // Kill the PTY process
    this.activeChild.kill();
    // Also ensure the entire process tree is terminated
    await killProcessTree(pid);
    this.activeChild = null;
  }
}
