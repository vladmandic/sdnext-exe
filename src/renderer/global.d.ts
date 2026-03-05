import type { InstallOptions, SdNextConfig, StartupState, TerminalDimensions, TerminalOutputEvent, UiStatus, VersionUpdateEvent, ToolsUpdateEvent, GPUUpdateEvent } from '../shared/types';

declare global {
  interface Window {
    sdnext: {
      startBootstrap: () => Promise<{ success: boolean }>;
      getStartupState: () => Promise<StartupState>;
      loadConfig: () => Promise<SdNextConfig>;
      saveConfig: (config: SdNextConfig) => Promise<SdNextConfig>;
      browseDirectory: () => Promise<string | null>;
      install: (config: SdNextConfig, options: InstallOptions, terminalDimensions?: TerminalDimensions) => Promise<{ success: boolean; code: number }>;
      start: (config: SdNextConfig, terminalDimensions?: TerminalDimensions) => Promise<{ success: boolean; code: number }>;
      stop: () => Promise<{ success: boolean }>;
      readLog: (kind: 'install' | 'start', config: SdNextConfig) => Promise<{ exists: boolean; path: string; content: string }>;
      openLog: (kind: 'install' | 'start', config: SdNextConfig) => Promise<{ success: boolean; message: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
      onTerminalOutput: (handler: (event: TerminalOutputEvent) => void) => () => void;
      onStatus: (handler: (status: UiStatus) => void) => () => void;
      onVersionUpdate: (handler: (event: VersionUpdateEvent) => void) => () => void;
      onToolsUpdate: (handler: (event: ToolsUpdateEvent) => void) => () => void;
      onGPUUpdate: (handler: (event: GPUUpdateEvent) => void) => () => void;
    };
  }
}

export {};
