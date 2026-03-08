export type RepoBranch = 'master' | 'dev';

export type ComputeBackend =
  | 'autodetect'
  | 'cuda'
  | 'rocm'
  | 'zluda'
  | 'directml'
  | 'ipex'
  | 'openvino';

export type ThemePreference = 'system' | 'dark' | 'light';

/**
 * Branded type for validated absolute paths
 * Prevents passing unvalidated strings where validated paths are expected
 */
export type ValidatedPath = string & { readonly __brand: 'ValidatedPath' };

/**
 * Branded type for validated environment variable names
 * Must match [A-Za-z_][A-Za-z0-9_]*
 */
export type ValidatedEnvVarName = string & { readonly __brand: 'ValidatedEnvVarName' };

/**
 * Validate and brand a path string
 * @param path Path to validate
 * @returns Branded ValidatedPath
 * @throws Error if path is not absolute
 */
export function validatePath(path: string): ValidatedPath {
  if (!path) {
    throw new Error('Path cannot be empty');
  }
  // Windows absolute path check: C:\... or \\...
  const isWindowsAbsolute = /^[a-zA-Z]:\\/.test(path) || path.startsWith('\\\\');
  // Unix absolute path check: /... or ~/...
  const isUnixAbsolute = path.startsWith('/') || path.startsWith('~/');
  
  if (!isWindowsAbsolute && !isUnixAbsolute) {
    throw new Error(`Path must be absolute: ${path}`);
  }
  return path as ValidatedPath;
}

/**
 * Validate and brand an environment variable name
 * @param name Variable name to validate
 * @returns Branded ValidatedEnvVarName
 * @throws Error if name doesn't match [A-Za-z_][A-Za-z0-9_]*
 */
export function validateEnvVarName(name: string): ValidatedEnvVarName {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name: ${name}`);
  }
  return name as ValidatedEnvVarName;
}

/**
 * UI Status type - supports both string form and error object form for future migration
 * New code should use createErrorStatus() helper for error messages
 */
export type UiStatus =
  | 'Idle'
  | 'Initializing...'
  | 'Bootstrapping...'
  | 'Unpacking Git...'
  | 'Extracting Git archive...'
  | 'Verifying Git installation...'
  | 'Unpacking Python...'
  | 'Extracting Python archive...'
  | 'Verifying Python installation...'
  | 'Bootstrap complete'
  | 'Installing...'
  | 'Installing dependencies...'
  | `Installing: ${string}`
  | 'Cloning repository...'
  | 'Creating VENV...'
  | 'Launching...'
  | 'Running...'
  | 'Ready...'
  | `Error: ${string}`;

/**
 * Helper to ensure consistent error message formatting
 * @param message Error message
 * @returns Properly formatted error status string
 */
export function createErrorStatus(message: string): UiStatus {
  return `Error: ${message}`;
}

export interface SdNextConfig {
  autoLaunch: boolean;
  public: boolean;
  upgrade: boolean;
  wipe: boolean;
  useUv: boolean;
  backend: ComputeBackend;
  repositoryBranch: RepoBranch;
  installationPath: string;
  modelsPath: string;
  customParameters: string;
  customEnvironment: string;
  gitRetryCount?: number; // Default: 3, Max retry attempts for network operations
  theme?: ThemePreference; // Default: 'system'
  windowState?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  /**
   * Whether the onboarding tutorial should be shown on startup or when the user
   * clicks the tutorial button.  Defaults to true.  When set to false the
   * tutorial will never display automatically (the button may still be used).
   */
  showTutorial?: boolean;
}

export interface InstallOptions {
  upgrade: boolean;
  forceReinstall: boolean;
  wipe: boolean;
  backend: ComputeBackend;
}

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

export interface InstalledVersion {
  commit: string;
  date: string;
}

export interface GPU {
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown';
}

export interface StartupState {
  logoPath: string;
  installed: boolean;
  version: string;
  status: UiStatus;
  tools: {
    python: string;
    git: string;
  };
  gpus: GPU[];
  recommendedBackend: ComputeBackend;
  bootstrapAvailable: boolean;
}

export interface TerminalOutputEvent {
  text: string;
  isError?: boolean;
}

export interface VersionUpdateEvent {
  installed: boolean;
  version: string;
}

export interface ToolsUpdateEvent {
  python: string;
  git: string;
  pythonOk: boolean;
  gitOk: boolean;
}

export interface GPUUpdateEvent {
  gpus: GPU[];
  recommendedBackend: ComputeBackend;
}

export interface ExtractionProgressEvent {
  git?: {
    filesExtracted: number;
  };
  python?: {
    filesExtracted: number;
  };
  currentTask?: string; // 'git' or 'python'
}
