import { contextBridge, ipcRenderer } from 'electron';
import type { InstallOptions, SdNextConfig, StartupState, TerminalDimensions, TerminalOutputEvent, UiStatus, VersionUpdateEvent, ToolsUpdateEvent, GPUUpdateEvent, ExtractionProgressEvent } from '../shared/types';

const api = {
  startBootstrap: (): Promise<{ success: boolean }> => ipcRenderer.invoke('launcher:start-bootstrap'),
  getStartupState: (): Promise<StartupState> => ipcRenderer.invoke('launcher:get-startup-state'),
  loadConfig: (): Promise<SdNextConfig> => ipcRenderer.invoke('launcher:load-config'),
  saveConfig: (config: SdNextConfig): Promise<SdNextConfig> => ipcRenderer.invoke('launcher:save-config', config),
  browseDirectory: (): Promise<string | null> => ipcRenderer.invoke('launcher:browse-directory'),
  install: (config: SdNextConfig, options: InstallOptions, terminalDimensions?: TerminalDimensions): Promise<{ success: boolean; code: number }> =>
    ipcRenderer.invoke('launcher:install', { config, options, terminalDimensions }),
  launch: (config: SdNextConfig, terminalDimensions?: TerminalDimensions): Promise<{ success: boolean; code: number }> => ipcRenderer.invoke('launcher:launch', { config, terminalDimensions }),
  stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('launcher:stop'),
  exit: (): Promise<{ success: boolean }> => ipcRenderer.invoke('launcher:exit'),
  readLog: (kind: 'install' | 'launch', config: SdNextConfig): Promise<{ exists: boolean; path: string; content: string }> =>
    ipcRenderer.invoke('launcher:read-log', { kind, config }),
  openLog: (kind: 'install' | 'launch', config: SdNextConfig): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('launcher:open-log', { kind, config }),
  openExternal: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('launcher:open-external', { url }),
  wipePath: (installationPath: string, target: 'venv' | 'bin' | 'app'): Promise<{ success: boolean; path: string; message?: string }> =>
    ipcRenderer.invoke('launcher:wipe-path', { installationPath, target }),
  getVersionInfo: (installationPath: string): Promise<{ appVersion: string; commitHash: string; commitDate: string; branch: string }> =>
    ipcRenderer.invoke('launcher:get-version-info', { installationPath }),
  onTerminalOutput: (handler: (event: TerminalOutputEvent) => void): (() => void) => {
    const wrapped = (_: unknown, payload: TerminalOutputEvent) => handler(payload);
    ipcRenderer.on('launcher:terminal', wrapped);
    return () => ipcRenderer.removeListener('launcher:terminal', wrapped);
  },
  onStatus: (handler: (status: UiStatus) => void): (() => void) => {
    const wrapped = (_: unknown, payload: UiStatus) => handler(payload);
    ipcRenderer.on('launcher:status', wrapped);
    return () => ipcRenderer.removeListener('launcher:status', wrapped);
  },
  onVersionUpdate: (handler: (event: VersionUpdateEvent) => void): (() => void) => {
    const wrapped = (_: unknown, payload: VersionUpdateEvent) => handler(payload);
    ipcRenderer.on('launcher:version-update', wrapped);
    return () => ipcRenderer.removeListener('launcher:version-update', wrapped);
  },
  onToolsUpdate: (handler: (event: ToolsUpdateEvent) => void): (() => void) => {
    const wrapped = (_: unknown, payload: ToolsUpdateEvent) => handler(payload);
    ipcRenderer.on('launcher:tools-update', wrapped);
    return () => ipcRenderer.removeListener('launcher:tools-update', wrapped);
  },
  onGPUUpdate: (handler: (event: GPUUpdateEvent) => void): (() => void) => {
    const wrapped = (_: unknown, payload: GPUUpdateEvent) => handler(payload);
    ipcRenderer.on('launcher:gpu-update', wrapped);
    return () => ipcRenderer.removeListener('launcher:gpu-update', wrapped);
  },
  onExtractionProgress: (handler: (event: ExtractionProgressEvent) => void): (() => void) => {
    const wrapped = (_: unknown, payload: ExtractionProgressEvent) => handler(payload);
    ipcRenderer.on('launcher:extraction-progress', wrapped);
    return () => ipcRenderer.removeListener('launcher:extraction-progress', wrapped);
  },
};

contextBridge.exposeInMainWorld('sdnext', api);
