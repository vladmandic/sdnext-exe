import type { InstallOptions, SdNextConfig, StartupState, TerminalDimensions, TerminalOutputEvent, UiStatus, VersionUpdateEvent, ToolsUpdateEvent, GPUUpdateEvent, ExtractionProgressEvent } from '../shared/types';

declare global {
  interface Window {
    sdnext: {
      startBootstrap: (installationPath?: string) => Promise<{ success: boolean }>;
      getStartupState: () => Promise<StartupState>;
      loadConfig: () => Promise<SdNextConfig>;
      saveConfig: (config: SdNextConfig) => Promise<SdNextConfig>;
      browseDirectory: () => Promise<string | null>;
      install: (config: SdNextConfig, options: InstallOptions, terminalDimensions?: TerminalDimensions) => Promise<{ success: boolean; code: number }>;
      launch: (config: SdNextConfig, terminalDimensions?: TerminalDimensions) => Promise<{ success: boolean; code: number }>;
      stop: () => Promise<{ success: boolean }>;
      exit: () => Promise<{ success: boolean }>;
      readLog: (kind: 'install' | 'launch', config: SdNextConfig) => Promise<{ exists: boolean; path: string; content: string }>;
      openLog: (kind: 'install' | 'launch', config: SdNextConfig) => Promise<{ success: boolean; message: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
      wipePath: (installationPath: string, target: 'venv' | 'bin' | 'app') => Promise<{ success: boolean; path: string; message?: string }>;
      getVersionInfo: (installationPath: string) => Promise<{ appVersion: string; commitHash: string; commitDate: string; branch: string }>;
      onTerminalOutput: (handler: (event: TerminalOutputEvent) => void) => () => void;
      onStatus: (handler: (status: UiStatus) => void) => () => void;
      onVersionUpdate: (handler: (event: VersionUpdateEvent) => void) => () => void;
      onToolsUpdate: (handler: (event: ToolsUpdateEvent) => void) => () => void;
      onGPUUpdate: (handler: (event: GPUUpdateEvent) => void) => () => void;
      onExtractionProgress: (handler: (event: ExtractionProgressEvent) => void) => () => void;
    };
  }
}

export {};
