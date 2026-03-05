export type RepoBranch = 'master' | 'dev';

export type ComputeBackend =
  | 'autodetect'
  | 'cuda'
  | 'rocm'
  | 'zluda'
  | 'directml'
  | 'ipex'
  | 'openvino';

export type UiStatus =
  | 'Idle'
  | 'Initializing...'
  | 'Bootstrapping...'
  | 'Unpacking Git...'
  | 'Unpacking Python...'
  | 'Bootstrap complete'
  | 'Installing...'
  | 'Cloning repository...'
  | 'Creating VENV...'
  | 'Installing dependencies...'
  | 'Running...'
  | `Error: ${string}`;

export interface SdNextConfig {
  autoLaunch: boolean;
  upgrade: boolean;
  reinstall: boolean;
  wipe: boolean;
  backend: ComputeBackend;
  repositoryBranch: RepoBranch;
  installationPath: string;
  modelsPath: string;
  customParameters: string;
  customEnvironment: string;
}

export interface InstallOptions {
  upgrade: boolean;
  reinstall: boolean;
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
