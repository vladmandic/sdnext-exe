/**
 * Type-safe IPC channel definitions
 * 
 * This file provides type mappings for Electron IPC channels to ensure
 * type safety across main/renderer process communication.
 */

import type {
  SdNextConfig,
  StartupState,
  InstallOptions,
  TerminalDimensions,
  UiStatus,
  TerminalOutputEvent,
  VersionUpdateEvent,
  ToolsUpdateEvent,
  GPUUpdateEvent,
} from './types';

/**
 * IPC channel names as const literals for type safety
 */
export const IPC_CHANNELS = {
  // Invoke handlers (main <- renderer)
  START_BOOTSTRAP: 'launcher:start-bootstrap',
  GET_STARTUP_STATE: 'launcher:get-startup-state',
  LOAD_CONFIG: 'launcher:load-config',
  SAVE_CONFIG: 'launcher:save-config',
  BROWSE_DIRECTORY: 'launcher:browse-directory',
  INSTALL: 'launcher:install',
  LAUNCH: 'launcher:launch',
  STOP: 'launcher:stop',
  EXIT: 'launcher:exit',
  READ_LOG: 'launcher:read-log',
  OPEN_LOG: 'launcher:open-log',
  OPEN_EXTERNAL: 'launcher:open-external',
  WIPE_PATH: 'launcher:wipe-path',
  GET_VERSION_INFO: 'launcher:get-version-info',

  // Event channels (main -> renderer)
  TERMINAL: 'launcher:terminal',
  STATUS: 'launcher:status',
  VERSION_UPDATE: 'launcher:version-update',
  TOOLS_UPDATE: 'launcher:tools-update',
  GPU_UPDATE: 'launcher:gpu-update',
} as const;

/**
 * Type mappings for IPC invoke handlers
 * Maps channel names to { params, return } types
 */
export interface IpcInvokeChannels {
  [IPC_CHANNELS.START_BOOTSTRAP]: {
    params: void;
    return: { success: boolean; message?: string };
  };
  [IPC_CHANNELS.GET_STARTUP_STATE]: {
    params: void;
    return: StartupState;
  };
  [IPC_CHANNELS.LOAD_CONFIG]: {
    params: void;
    return: SdNextConfig;
  };
  [IPC_CHANNELS.SAVE_CONFIG]: {
    params: SdNextConfig;
    return: SdNextConfig;
  };
  [IPC_CHANNELS.BROWSE_DIRECTORY]: {
    params: void;
    return: string | null;
  };
  [IPC_CHANNELS.INSTALL]: {
    params: {
      config: SdNextConfig;
      options: InstallOptions;
      terminalDimensions?: TerminalDimensions;
    };
    return: { success: boolean; code: number };
  };
  [IPC_CHANNELS.LAUNCH]: {
    params: {
      config: SdNextConfig;
      terminalDimensions?: TerminalDimensions;
    };
    return: { success: boolean; code: number };
  };
  [IPC_CHANNELS.STOP]: {
    params: void;
    return: { success: boolean };
  };
  [IPC_CHANNELS.EXIT]: {
    params: void;
    return: { success: boolean };
  };
  [IPC_CHANNELS.READ_LOG]: {
    params: {
      kind: 'install' | 'launch';
      config: SdNextConfig;
    };
    return: { exists: boolean; path: string; content: string };
  };
  [IPC_CHANNELS.OPEN_LOG]: {
    params: {
      kind: 'install' | 'launch';
      config: SdNextConfig;
    };
    return: { success: boolean; message: string };
  };
  [IPC_CHANNELS.OPEN_EXTERNAL]: {
    params: { url: string };
    return: { success: boolean; message?: string };
  };
  [IPC_CHANNELS.WIPE_PATH]: {
    params: {
      installationPath: string;
      target: 'venv' | 'bin' | 'app';
    };
    return: { success: boolean; path: string; message?: string };
  };
  [IPC_CHANNELS.GET_VERSION_INFO]: {
    params: { installationPath: string };
    return: {
      appVersion: string;
      commitHash: string;
      commitDate: string;
      branch: string;
    };
  };
}

/**
 * Type mappings for IPC event channels
 * Maps channel names to event payload types
 */
export interface IpcEventChannels {
  [IPC_CHANNELS.TERMINAL]: TerminalOutputEvent;
  [IPC_CHANNELS.STATUS]: UiStatus;
  [IPC_CHANNELS.VERSION_UPDATE]: VersionUpdateEvent;
  [IPC_CHANNELS.TOOLS_UPDATE]: ToolsUpdateEvent;
  [IPC_CHANNELS.GPU_UPDATE]: GPUUpdateEvent;
}

/**
 * Type helper for invoke channel names
 */
export type IpcInvokeChannel = keyof IpcInvokeChannels;

/**
 * Type helper for event channel names
 */
export type IpcEventChannel = keyof IpcEventChannels;

/**
 * Type-safe IPC invoke helper for renderer process
 */
export type TypedIpcInvoke = <T extends IpcInvokeChannel>(
  channel: T,
  ...args: IpcInvokeChannels[T]['params'] extends void
    ? []
    : [IpcInvokeChannels[T]['params']]
) => Promise<IpcInvokeChannels[T]['return']>;

/**
 * Type-safe IPC send helper for main process
 */
export type TypedIpcSend = <T extends IpcEventChannel>(
  channel: T,
  payload: IpcEventChannels[T],
) => void;

/**
 * Type-safe event listener helper for renderer process
 */
export type TypedIpcOn = <T extends IpcEventChannel>(
  channel: T,
  listener: (payload: IpcEventChannels[T]) => void,
) => () => void;
