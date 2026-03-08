/* eslint react-hooks/exhaustive-deps: off */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Chromium,
  FolderOpen,
  Package,
  Power,
  Play,
  Square,
  SlidersHorizontal,
  Trash2,
  Wrench,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
} from 'lucide-react';

import type { SdNextConfig, StartupState, TerminalDimensions, UiStatus } from '../shared/types';
import { toast, Toaster } from 'sonner';
import 'sonner/dist/styles.css';

import { STATUS } from '../shared/status-constants';
import { LazyTerminalPanel } from './components/LazyTerminalPanel';
import { ProgressBar } from './components/ProgressBar';
import { useDebounce } from './hooks/useDebounce';

type ActionState = 'idle' | 'bootstrap' | 'install' | 'launch' | 'wipe-venv' | 'wipe-bin' | 'wipe-app';
type WipeTarget = 'venv' | 'bin' | 'app';
const VERSION_CHECK_DEDUPE_MS = 2000;

// Tutorial data: text plus selector for element to highlight
const TUTORIAL_DATA: { text: string; selector: string | null }[] = [
  { text: 'Click "Bootstrap" to unpack bundled Git and Python tools to be used by the app', selector: '.icon-btn.action-btn[aria-label="Bootstrap"]' },
  { text: 'Verify "Options" are set correctly for your environment: GPU type, paths, startup options, etc.', selector: '.options-toggle' },
  { text: 'Click "Install" to download latest version of SD.Next and install requirements', selector: '.icon-btn.action-btn[aria-label="Install"]' },
  { text: 'Click "Launch" to start the app', selector: '.icon-btn.action-btn[aria-label="Launch"]' },
  { text: 'Click "Open Browser" to open the app in your default web browser once it\'s running', selector: 'button[aria-label="Open browser"]' },
  { text: 'Click "Stop" to immediately stop the app if needed', selector: '.icon-btn.action-btn.danger[aria-label="Stop"]' },
  { text: 'Monitor the terminal for progress: Logs are your friend! They will show you what\'s happening behind the scenes and help you troubleshoot if anything goes wrong.', selector: '.terminal-wrap' },
  { text: 'Click Copy/Download logs to save the terminal output for later reference or sharing with support', selector: '.terminal-actions' },
  { text: 'Click the "Docs" tab to view full documentation for help with SD.Next usage and features', selector: '.terminal-tabs .tabs-buttons button:nth-child(2)' },
  { text: 'Click the "Changelog" tab to see a list of recent changes in SD.Next', selector: '.terminal-tabs .tabs-buttons button:nth-child(3)' },
];

// backwards-compat alias for any stray references
const _TUTORIAL_STEPS: string[] = TUTORIAL_DATA.map(d => d.text);



const defaultStartupState: StartupState = {
  logoPath: '',
  installed: false,
  version: 'N/A',
  status: STATUS.IDLE as UiStatus,
  tools: {
    python: 'N/A',
    git: 'N/A',
  },
  gpus: [],
  recommendedBackend: 'autodetect',
  bootstrapAvailable: false,
};

const defaultConfig: SdNextConfig = {
  autoLaunch: false,
  public: false,
  upgrade: false,
  wipe: false,
  useUv: false,
  backend: 'autodetect',
  repositoryBranch: 'dev',
  installationPath: '',
  modelsPath: '',
  customParameters: '',
  customEnvironment: '',
  showTutorial: true,
};

const isBootstrapStatus = (status: UiStatus): boolean => {
  return (
    status === STATUS.INITIALIZING ||
    status === STATUS.BOOTSTRAPPING ||
    status === STATUS.UNPACKING_GIT ||
    status === STATUS.EXTRACTING_GIT ||
    status === STATUS.VERIFYING_GIT ||
    status === STATUS.UNPACKING_PYTHON ||
    status === STATUS.EXTRACTING_PYTHON ||
    status === STATUS.VERIFYING_PYTHON
  );
};

const isBusyStatus = (status: UiStatus): boolean => {
  const isReadyStatus = status.startsWith('Ready');
  const isInstallingPackageStatus = status.startsWith('Installing:');
  return (
    isBootstrapStatus(status) ||
    status === 'Installing...' ||
    isInstallingPackageStatus ||
    status === 'Cloning repository...' ||
    status === 'Creating VENV...' ||
    status === 'Installing dependencies...' ||
    status === STATUS.LAUNCHING ||
    status === 'Running...' ||
    isReadyStatus
  );
};

const ANSI_CSI_ESCAPE_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g;
const ANSI_OSC_ESCAPE_RE = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
const ANSI_SINGLE_ESCAPE_RE = /\u001B[@-Z\\-_]/g;
const INSTALL_PACKAGE_RE = /Install:\s+package=["']?([a-zA-Z0-9_\.\-]+)/g;
const INSTALL_VERIFYING_RE = /Starting module/i;
const TORCH_BACKEND_LINE_RE = /(Torch backend[^\r\n]*)/i;
const INSTALL_EXPECTED_PACKAGES = 76;
const LAST_TORCH_BACKEND_KEY = 'sdnext:lastTorchBackend';

const normalizeTorchBackendInfo = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed === 'Checking...') {
    return trimmed || 'N/A';
  }

  let normalized = trimmed.replace(/^Torch backend\s*:\s*/i, '');
  normalized = normalized.replace(/version\s*=\s*"([^"]+)"/i, '$1');

  return normalized.trim();
};

const stripAnsiSequences = (text: string): string => {
  return text
    .replace(ANSI_OSC_ESCAPE_RE, '')
    .replace(ANSI_CSI_ESCAPE_RE, '')
    .replace(ANSI_SINGLE_ESCAPE_RE, '');
};

const normalizeTerminalChunk = (text: string): string => {
  // Preserve ANSI sequences for xterm rendering (colors/cursor control).
  const normalized = text
    .replace(/\r\n/g, '\n')
    // Bare carriage-return is an in-place rewrite marker, not a new line.
    .replace(/\r/g, '');
  return normalized;
};

const appendTerminalChunk = (prev: string[], nextChunk: string): string[] => {
  if (!nextChunk) {
    return prev;
  }

  if (prev.length === 0) {
    return [nextChunk];
  }

  const lastChunk = prev[prev.length - 1] ?? '';
  let chunk = nextChunk;

  // Prevent double blank rows caused by chunk boundaries like "...\n" + "\n...".
  if (lastChunk.endsWith('\n') && chunk.startsWith('\n')) {
    chunk = chunk.replace(/^\n+/, '\n');
  }

  if (chunk.length === 0) {
    return prev;
  }

  return [...prev, chunk];
};

type ContentTab = 'terminal' | 'docs' | 'changelog';

export function App() {
  const [startup, setStartup] = useState<StartupState>(defaultStartupState);
  const [config, setConfig] = useState<SdNextConfig>(defaultConfig);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [terminalDimensions, setTerminalDimensions] = useState<TerminalDimensions>({ cols: 80, rows: 24 });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ContentTab>('terminal');
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionState>('idle');
  const [logoAttempt, setLogoAttempt] = useState(0);
  const [changelogHtml, setChangelogHtml] = useState('');
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState({ appVersion: 'N/A', commitHash: 'N/A', commitDate: 'N/A', branch: 'N/A' });
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'up-to-date' | 'available' | 'error'>('checking');
  const [commitsBehind, setCommitsBehind] = useState<number | null>(null);
  const versionCheckRef = useRef<{ 
    inFlightKey: string | null; 
    lastKey: string; 
    lastAt: number;
    inFlightPromise: Promise<void> | null;
  }>({
    inFlightKey: null,
    lastKey: '',
    lastAt: 0,
    inFlightPromise: null,
  });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; message: string; onConfirm: () => void; onCancel: () => void } | null>(null);
  const [themePreference, setThemePreference] = useState<'system' | 'dark' | 'light'>('system');
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [extractionProgress, setExtractionProgress] = useState<{ gitFiles: number; pythonFiles: number }>({
    gitFiles: 0,
    pythonFiles: 0,
  });
  const [installProgress, setInstallProgress] = useState<{
    completed: number;
    total: number;
    currentPackage: string;
    visible: boolean;
  }>({
    completed: 0,
    total: INSTALL_EXPECTED_PACKAGES,
    currentPackage: '',
    visible: false,
  });
  const [installStatusOverride, setInstallStatusOverride] = useState<string | null>(null);
  const installTerminalTailRef = useRef('');
  const [browserUrl, setBrowserUrl] = useState<string>('');
  const [tutorialRunning, setTutorialRunning] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const tutorialTimerRef = useRef<number | null>(null);
  const [torchBackendInfo, setTorchBackendInfo] = useState<string>(() => {
    try {
      const cached = localStorage.getItem(LAST_TORCH_BACKEND_KEY);
      return cached?.trim() ? normalizeTorchBackendInfo(cached) : 'N/A';
    } catch {
      return 'N/A';
    }
  });
  const torchTerminalTailRef = useRef('');

  // Compute actual dark theme state
  const isDarkTheme = themePreference === 'system' ? systemIsDark : themePreference === 'dark';

  // Apply theme based on preference and system settings
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
      }
    };

    if (themePreference === 'system') {
      // Remove data-theme to use CSS media queries
      document.documentElement.removeAttribute('data-theme');
      // Check system preference for color-scheme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    } else {
      applyTheme(themePreference === 'dark');
    }
  }, [themePreference]);

  // Listen to system theme changes when preference is 'system'
  useEffect(() => {
    if (themePreference !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemIsDark(event.matches);
      document.documentElement.style.colorScheme = event.matches ? 'dark' : 'light';
    };

    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, [themePreference]);

  const refreshStartup = async (): Promise<void> => {
    const startupState = await window.sdnext.getStartupState();
    setStartup(startupState);
    return;
  };


  const fetchVersionInfo = useCallback(
    async (installationPath: string, force = false): Promise<void> => {
      if (!installationPath) {
        return;
      }

      const key = installationPath;
      const now = Date.now();
      const state = versionCheckRef.current;
      
      // If same key is in flight, wait for it to complete instead of duplicating work
      if (state.inFlightKey === key && state.inFlightPromise) {
        return state.inFlightPromise;
      }
      
      const isRecentDuplicate = state.lastKey === key && now - state.lastAt < VERSION_CHECK_DEDUPE_MS;
      if (!force && isRecentDuplicate) {
        return;
      }

      // Create and store the promise immediately before any awaits
      const versionCheckPromise = (async () => {
        state.inFlightKey = key;
        try {
          const info = await window.sdnext.getVersionInfo(installationPath);
          setVersionInfo(info);

          // Check for updates on GitHub
          if (info.commitHash !== 'N/A') {
            setUpdateStatus('checking');
            setCommitsBehind(null);
            try {
              const branch = info.branch && info.branch !== 'N/A' ? info.branch : 'dev';
              const response = await fetch(`https://api.github.com/repos/vladmandic/sdnext/compare/${info.commitHash}...${branch}`);
              if (response.ok) {
                const data = await response.json();
                // For compare(base...head), "ahead_by" indicates how many commits head is ahead of base.
                // Here base is local commit and head is remote branch, so ahead_by means "you are behind".
                const remoteAhead = typeof data.ahead_by === 'number' ? data.ahead_by : 0;
                const localAhead = typeof data.behind_by === 'number' ? data.behind_by : 0;

                if (remoteAhead > 0) {
                  setUpdateStatus('available');
                  setCommitsBehind(remoteAhead);
                } else if (localAhead > 0) {
                  // Local is ahead; no update needed.
                  setUpdateStatus('up-to-date');
                  setCommitsBehind(0);
                } else {
                  // identical or unknown state without distance
                  setUpdateStatus('up-to-date');
                  setCommitsBehind(0);
                }
              } else {
                setUpdateStatus('error');
                setCommitsBehind(null);
              }
            } catch {
              setUpdateStatus('error');
              setCommitsBehind(null);
            }
          } else {
            setCommitsBehind(null);
          }
        } catch (error) {
          console.error('Failed to fetch version info:', error);
        } finally {
          state.lastKey = key;
          state.lastAt = Date.now();
          if (state.inFlightKey === key) {
            state.inFlightKey = null;
            state.inFlightPromise = null;
          }
        }
      })();

      state.inFlightPromise = versionCheckPromise;
      return versionCheckPromise;
    },
    [],
  );

  useEffect(() => {
    // Set up listeners immediately (non-blocking)
    const removeTerminalListener = window.sdnext.onTerminalOutput((event) => {
      // Watch for 'Local URL:' during launch to enable open browser button
      if (activeAction === 'launch') {
        const urlMatch = event.text.match(/Local URL:\s*(\S+)/);
        if (urlMatch) {
          // strip ANSI escapes which sometimes appear in terminal output
          let raw = stripAnsiSequences(urlMatch[1]);
          raw = raw.trim();
          // if missing scheme, assume http
          if (raw && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) {
            raw = 'http://' + raw;
          }
          setBrowserUrl(raw);
        }
      }

      if (activeAction === 'install' || activeAction === 'launch') {
        const strippedChunk = stripAnsiSequences(event.text)
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
        const combinedTorchChunk = `${torchTerminalTailRef.current}${strippedChunk}`;
        const torchMatch = combinedTorchChunk.match(TORCH_BACKEND_LINE_RE);
        if (torchMatch?.[1]) {
          setTorchBackendInfo(normalizeTorchBackendInfo(torchMatch[1]));
        }
        torchTerminalTailRef.current = combinedTorchChunk.slice(-512);
      }

      if (activeAction === 'install') {
        const previousTail = installTerminalTailRef.current;
        const strippedInstallChunk = stripAnsiSequences(event.text);
        const combinedChunk = `${previousTail}${strippedInstallChunk}`;
        const nextTail = combinedChunk.slice(-96);
        installTerminalTailRef.current = nextTail;

        if (INSTALL_VERIFYING_RE.test(combinedChunk)) {
          setInstallStatusOverride('Verifying...');
          setInstallProgress((prev) => ({ ...prev, visible: false, currentPackage: '' }));
        } else {
          const newPackages: string[] = [];
          let match: RegExpExecArray | null;
          INSTALL_PACKAGE_RE.lastIndex = 0;
          while ((match = INSTALL_PACKAGE_RE.exec(combinedChunk)) !== null) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            if (matchEnd > previousTail.length) {
              const pkg = match[1];
              newPackages.push(pkg);
            }
          }

          if (newPackages.length > 0) {
            const latestPackage = newPackages[newPackages.length - 1] ?? '';
            setInstallProgress((prev) => ({
              ...prev,
              visible: true,
              currentPackage: latestPackage,
              completed: Math.min(prev.completed + newPackages.length, prev.total),
            }));
            setInstallStatusOverride(`Installing: ${latestPackage}`);
          }

          if (event.text.includes('\n')) {
            setInstallStatusOverride('Installing...');
          }
        }
      }

      const chunk = normalizeTerminalChunk(event.text);
      if (chunk.length === 0) {
        return;
      }
      setTerminalLines((prev) => appendTerminalChunk(prev, chunk));
    });

    const removeStatusListener = window.sdnext.onStatus((status: UiStatus) => {
      setStartup((prev) => ({ ...prev, status }));
      setBusy(isBusyStatus(status));
      // clear browser URL whenever app isn't ready/running
      if (!status.startsWith('Ready')) {
        setBrowserUrl('');
      }
      // If status is now has package name (Installing: XXX), it came from main process and should override local parsing
      if (status.startsWith('Installing:')) {
        setInstallStatusOverride(null); // Use the main process status
      } else if (activeAction !== 'install') {
        setInstallStatusOverride(null);
      }
    });

    const removeVersionListener = window.sdnext.onVersionUpdate((event) => {
      setStartup((prev) => ({ ...prev, installed: event.installed, version: event.version }));
    });

    const removeGPUListener = window.sdnext.onGPUUpdate((event) => {
      setStartup((prev) => ({ ...prev, gpus: event.gpus, recommendedBackend: event.recommendedBackend }));
    });

    const removeToolsListener = window.sdnext.onToolsUpdate((event) => {
      setStartup((prev) => ({ ...prev, tools: { python: event.python, git: event.git } }));
    });

    const removeProgressListener = window.sdnext.onExtractionProgress((event) => {
      setExtractionProgress({
        gitFiles: event.git?.filesExtracted ?? 0,
        pythonFiles: event.python?.filesExtracted ?? 0,
      });
    });

    // Load config and startup state asynchronously (after UI renders)
    void Promise.all([window.sdnext.getStartupState(), window.sdnext.loadConfig()]).then(([startupState, loadedConfig]) => {
      setStartup(startupState);
      // Always reset wipe to false for safety (destructive operation should not persist)
      setConfig({ ...loadedConfig, wipe: false });
      // Set theme preference from config (default to 'system' if not set)
      setThemePreference(loadedConfig.theme ?? 'system');
      // automatically show tutorial if not disabled
      if (loadedConfig.showTutorial !== false) {
        setTutorialRunning(true);
        setTutorialStep(0);
      }
    });

    return () => {
      removeTerminalListener();
      removeStatusListener();
      removeVersionListener();
      removeGPUListener();
      removeToolsListener();
      removeProgressListener();
    };
  }, [activeAction]);

  // Separate effect for polling while initializing
  useEffect(() => {
    if (startup.status !== 'Initializing...') {
      return;
    }

    const pollInterval = setInterval(() => {
      void refreshStartup();
    }, 500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [startup.status]);

  // Fetch version info when installation path and tool availability allow it
  useEffect(() => {
    if (!config.installationPath) {
      return;
    }

    const gitReady = startup.tools.git !== 'N/A' && startup.tools.git !== 'Unavailable' && startup.tools.git !== 'Unknown';
    if (!gitReady) {
      return;
    }

    void fetchVersionInfo(config.installationPath);
  }, [config.installationPath, startup.tools.git, fetchVersionInfo]);

  // Handle keyboard shortcuts for confirm dialog
  useEffect(() => {
    if (!confirmDialog?.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmDialog.onConfirm();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        confirmDialog.onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmDialog]);

  const displayStatus = useMemo(() => installStatusOverride ?? startup.status, [installStatusOverride, startup.status]);
  const isInitializing = useMemo(() => startup.status === 'Initializing...', [startup.status]);
  const isBootstrapping = useMemo(() => isBootstrapStatus(startup.status), [startup.status]);
  const isErrorStatus = useMemo(() => displayStatus.startsWith('Error:'), [displayStatus]);
  const isBootstrapRequired = useMemo(
    () => startup.status.includes('unavailable') && startup.status.includes('bootstrap required'),
    [startup.status],
  );
  const bootstrapNeeded = useMemo(() => {
    return (
      isBootstrapRequired ||
      startup.tools.python === 'N/A' ||
      startup.tools.git === 'N/A' ||
      startup.tools.python === 'Unavailable' ||
      startup.tools.git === 'Unavailable' ||
      startup.tools.python === 'Unknown' ||
      startup.tools.git === 'Unknown'
    );
  }, [isBootstrapRequired, startup.tools]);
  const bootstrapComplete = useMemo(() => {
    return !bootstrapNeeded && !isBootstrapping;
  }, [bootstrapNeeded, isBootstrapping]);
  const canStop = useMemo(() => {
    const isReadyStatus = startup.status.startsWith('Ready');
    const isInstallingPackageStatus = startup.status.startsWith('Installing:');
    return (
      isBootstrapStatus(startup.status) ||
      startup.status === 'Installing...' ||
      isInstallingPackageStatus ||
      startup.status === 'Cloning repository...' ||
      startup.status === 'Creating VENV...' ||
      startup.status === 'Installing dependencies...' ||
      startup.status === STATUS.LAUNCHING ||
      startup.status === 'Running...' ||
      isReadyStatus
    );
  }, [startup.status]);
  const canExit = useMemo(() => {
    return !busy && !canStop && activeAction === 'idle' && !isInitializing;
  }, [activeAction, busy, canStop, isInitializing]);

  const formattedStatus = useMemo(() => {
    if (displayStatus.startsWith('Installing: ')) {
      const packageName = displayStatus.substring('Installing: '.length);
      return (
        <>
          Installing:{' '}
          <span style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent-strong)' }}>
            {packageName}
          </span>
        </>
      );
    }
    return displayStatus;
  }, [displayStatus]);

  const logoCandidates = useMemo(() => {
    const isWebContext = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    const candidates: string[] = [];

    if (isWebContext) {
      // In Vite dev mode, prefer public assets over file:// paths.
      candidates.push('/sdnext.png', '/logo.png');
    } else {
      // In packaged/file mode, prefer local files first.
      candidates.push('./sdnext.png', './logo.png');
    }

    if (startup.logoPath) {
      candidates.push(`file:///${startup.logoPath.replace(/\\/g, '/')}`);
    }

    return candidates;
  }, [startup.logoPath]);

  const logoSrc = useMemo(() => {
    if (logoCandidates.length === 0) {
      return '';
    }

    const index = Math.min(logoAttempt, logoCandidates.length - 1);
    return logoCandidates[index] ?? '';
  }, [logoCandidates, logoAttempt]);

  useEffect(() => {
    setLogoAttempt(0);
  }, [logoCandidates]);

  useEffect(() => {
    if (!torchBackendInfo || torchBackendInfo === 'N/A' || torchBackendInfo === 'Checking...') {
      return;
    }
    try {
      localStorage.setItem(LAST_TORCH_BACKEND_KEY, torchBackendInfo);
    } catch {
      // Ignore storage failures (private mode, disabled storage, etc.)
    }
  }, [torchBackendInfo]);

  const gpuDisplay = useMemo(() => {
    if (startup.gpus.length === 0) {
      return 'No GPU detected';
    }
    return startup.gpus.map((gpu, index) => `${index}:${gpu.name}`).join(' | ');
  }, [startup.gpus]);

  const pythonDisplay = useMemo(() => {
    return startup.tools.python.replace(/^python\s+/i, '');
  }, [startup.tools.python]);

  const updateConfig = <K extends keyof SdNextConfig>(key: K, value: SdNextConfig[K]): void => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Debounced config save to reduce disk I/O during rapid changes
  const debouncedSaveConfig = useDebounce(async (nextConfig: SdNextConfig) => {
    await window.sdnext.saveConfig(nextConfig);
  }, 500);

  const browseAndSet = async (target: 'installationPath' | 'modelsPath'): Promise<void> => {
    const selected = await window.sdnext.browseDirectory();
    if (selected) {
      updateConfig(target, selected);
      await window.sdnext.saveConfig({ ...config, [target]: selected });
    }
  };

  const persistConfig = async (): Promise<void> => {
    await window.sdnext.saveConfig(config);
    await refreshStartup();
  };

  const install = async (): Promise<void> => {
    let forceReinstall = false;
    if (startup.installed) {
      const confirmed = await showConfirm(
        'Existing installation detected. Do you want to reinstall dependencies now?',
      );
      if (!confirmed) {
        return;
      }
      forceReinstall = true;
    }

    setActiveAction('install');
    setBusy(true);
    setTerminalLines([]);
    setInstallStatusOverride(null);
    setTorchBackendInfo('Checking...');
    setInstallProgress({
      completed: 0,
      total: INSTALL_EXPECTED_PACKAGES,
      currentPackage: '',
      visible: true,
    });
    installTerminalTailRef.current = '';
    torchTerminalTailRef.current = '';
    try {
      // Use recommended backend when autodetect is selected
      const effectiveBackend = config.backend === 'autodetect' ? startup.recommendedBackend : config.backend;
      const result = await window.sdnext.install(config, {
        upgrade: config.upgrade,
        forceReinstall,
        wipe: false,
        backend: effectiveBackend,
      }, terminalDimensions);
      if (result.success) {
        setInstallStatusOverride('Done');
        setInstallProgress((prev) => ({ ...prev, visible: false, currentPackage: '' }));
        await refreshStartup();
        await fetchVersionInfo(config.installationPath, true);
      } else {
        setInstallStatusOverride(null);
        setInstallProgress((prev) => ({ ...prev, visible: false, currentPackage: '' }));
      }
    } finally {
      setInstallProgress((prev) => ({ ...prev, visible: false, currentPackage: '' }));
      setActiveAction((prev) => (prev === 'install' ? 'idle' : prev));
    }
  };

  const bootstrap = async (): Promise<void> => {
    // If tools are already available, ask for confirmation
    if (!bootstrapNeeded) {
      setConfirmDialog({
        open: true,
        message: 'Tools are already available. Do you want to reinstall them? This will replace the existing bundled tools.',
        onConfirm: () => {
          setConfirmDialog(null);
          void performBootstrap();
        },
        onCancel: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }
    
    await performBootstrap();
  };

  const performBootstrap = async (): Promise<void> => {
    setActiveAction('bootstrap');
    setBusy(true);
    setTerminalLines([]);
    try {
      await window.sdnext.startBootstrap();
      // Poll for completion and keep bootstrap button visually pressed while active.
      await new Promise<void>((resolve, reject) => {
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let isCleanedUp = false;
        
        const cleanup = () => {
          if (isCleanedUp) return;
          isCleanedUp = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        };
        
        pollInterval = setInterval(async () => {
          try {
            await refreshStartup();
            const state = await window.sdnext.getStartupState();
            if (!isBootstrapStatus(state.status)) {
              cleanup();
              setBusy(false);
              resolve();
            }
          } catch (error) {
            cleanup();
            reject(error);
          }
        }, 500);
      });
      
      // After bootstrap completes, force a final refresh to ensure all state is updated
      await new Promise((resolve) => setTimeout(resolve, 300));
      await refreshStartup();
    } finally {
      setActiveAction((prev) => (prev === 'bootstrap' ? 'idle' : prev));
    }
  };

  const launch = async (): Promise<void> => {
    setActiveAction('launch');
    setBusy(true);
    setTerminalLines([]);
    setTorchBackendInfo('Checking...');
    torchTerminalTailRef.current = '';
    try {
      // Use recommended backend when autodetect is selected, without modifying persistent config
      const effectiveConfig = config.backend === 'autodetect' 
        ? { ...config, backend: startup.recommendedBackend }
        : config;
      await window.sdnext.launch(effectiveConfig, terminalDimensions);
    } finally {
      setActiveAction((prev) => (prev === 'launch' ? 'idle' : prev));
    }
  };

  const stop = async (): Promise<void> => {
    await window.sdnext.stop();
  };

  const exit = async (): Promise<void> => {
    const sdnextApi = window.sdnext as {
      exit: () => Promise<{ success: boolean }>;
    };
    await sdnextApi.exit();
  };

  const copySession = async (): Promise<void> => {
    const plainText = stripAnsiSequences(terminalLines.join(''))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    await navigator.clipboard.writeText(plainText);
  };

  const downloadTextFile = (filename: string, content: string): void => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSession = (): void => {
    const plainText = stripAnsiSequences(terminalLines.join(''))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    downloadTextFile('sdnext-session.log', plainText);
  };

  const clearTerminal = (): void => {
    setTerminalLines([]);
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        message,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  };

  const wipeTarget = async (target: WipeTarget): Promise<void> => {
    const labels: Record<WipeTarget, string> = {
      venv: 'venv',
      bin: 'bin',
      app: 'app',
    };

    const confirmed = await showConfirm(
      `This will permanently delete ${config.installationPath}/${labels[target]}. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    setActiveAction(`wipe-${target}`);
    setBusy(true);
    setTerminalLines((prev) => [
      ...prev,
      `[wipe] Removing ${labels[target]} from ${config.installationPath}\n`,
    ]);

    try {
      const result = await window.sdnext.wipePath(config.installationPath, target);
      if (result.success) {
        setTerminalLines((prev) => [
          ...prev,
          `[wipe] Removed ${result.path}\n`,
        ]);
      } else {
        setTerminalLines((prev) => [
          ...prev,
          `[wipe] Failed: ${result.message}\n`,
        ]);
      }
      await refreshStartup();
    } finally {
      setBusy(false);
      setActiveAction('idle');
    }
  };

  const handleTerminalDimensionsChange = useCallback((cols: number, rows: number): void => {
    setTerminalDimensions({ cols, rows });
  }, []);

  const changelogBlobUrl = useMemo(() => {
    return `https://github.com/vladmandic/sdnext/blob/${config.repositoryBranch}/CHANGELOG.md`;
  }, [config.repositoryBranch]);

  const changelogRawUrl = useMemo(() => {
    return `https://raw.githubusercontent.com/vladmandic/sdnext/${config.repositoryBranch}/CHANGELOG.md`;
  }, [config.repositoryBranch]);

  const handleLogoClick = async (): Promise<void> => {
    await window.sdnext.openExternal('https://github.com/vladmandic/sdnext');
  };

  const toggleTheme = async (): Promise<void> => {
    // Cycle through: system -> dark -> light -> system
    const nextTheme: 'system' | 'dark' | 'light' =
      themePreference === 'system' ? 'dark' :
      themePreference === 'dark' ? 'light' : 'system';
    
    setThemePreference(nextTheme);
    
    // Save to config
    const updatedConfig = { ...config, theme: nextTheme };
    setConfig(updatedConfig);
    await window.sdnext.saveConfig(updatedConfig);
  };

  // --- Tutorial helpers --------------------------------------------------
  const stopTutorial = useCallback((): void => {
    setTutorialRunning(false);
    setTutorialStep(0);
    if (tutorialTimerRef.current !== null) {
      clearTimeout(tutorialTimerRef.current);
      tutorialTimerRef.current = null;
    }
    toast.dismiss();
    // remove any remaining highlights
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
  }, []);

  const disableTutorial = useCallback(async (): Promise<void> => {
    const updatedConfig = { ...config, showTutorial: false };
    setConfig(updatedConfig);
    await window.sdnext.saveConfig(updatedConfig);
    stopTutorial();
  }, [config, stopTutorial]);

  const showTutorialStep = useCallback((step: number): void => {
    toast.dismiss();

    // clear any existing highlights
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));

    // highlight target element if specified
    const sel = TUTORIAL_DATA[step].selector;
    if (sel) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        el.classList.add('tutorial-highlight');
      }
    }

    const content = (
      <div style={{ maxWidth: 380, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <p>{TUTORIAL_DATA[step].text}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            className="btn ghost"
            disabled={step === 0}
            onClick={() => setTutorialStep((p) => Math.max(p - 1, 0))}
          >
            <ChevronLeft size={16} />
          </button>
          <button className="btn ghost" onClick={stopTutorial}>
            <X size={16} />
          </button>
          <button className="btn ghost" onClick={() => setTutorialStep((p) => Math.min(p + 1, TUTORIAL_DATA.length - 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={config.showTutorial === false}
              onChange={() => void disableTutorial()}
            />{' '}
            Don't show again
          </label>
        </div>
      </div>
    );

    toast.custom(() => content, { duration: Infinity, className: 'custom' });

    // schedule auto‑advance
    if (tutorialTimerRef.current !== null) {
      clearTimeout(tutorialTimerRef.current);
    }
    tutorialTimerRef.current = window.setTimeout(() => {
      setTutorialStep((p) => Math.min(p + 1, TUTORIAL_DATA.length - 1));
    }, 10000);
  }, [disableTutorial, stopTutorial]);

  const startTutorial = (force = false): void => {
    // if forced (manual click) ignore disable flag, otherwise respect config
    if (!force && config.showTutorial === false) {
      return;
    }
    setTutorialRunning(true);
    setTutorialStep(0);
  };

  // trigger toast whenever step/running state changes
  useEffect(() => {
    if (tutorialRunning) {
      showTutorialStep(tutorialStep);
    }
  }, [tutorialStep, tutorialRunning, showTutorialStep]);

  useEffect(() => {
    if (activeTab !== 'changelog') {
      return;
    }

    const controller = new AbortController();

    const loadChangelog = async (): Promise<void> => {
      setChangelogLoading(true);
      setChangelogError(null);

      try {
        const rawResponse = await fetch(changelogRawUrl, { signal: controller.signal });
        if (!rawResponse.ok) {
          throw new Error(`Failed to load changelog markdown (${rawResponse.status})`);
        }
        const markdown = await rawResponse.text();

        const renderResponse = await fetch('https://api.github.com/markdown', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/html',
          },
          body: JSON.stringify({
            text: markdown,
            mode: 'gfm',
            context: 'vladmandic/sdnext',
          }),
          signal: controller.signal,
        });

        if (!renderResponse.ok) {
          throw new Error(`Failed to render changelog markdown (${renderResponse.status})`);
        }

        const html = await renderResponse.text();
        setChangelogHtml(html);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setChangelogError(message);
      } finally {
        setChangelogLoading(false);
      }
    };

    void loadChangelog();

    return () => {
      controller.abort();
    };
  }, [activeTab, changelogRawUrl]);

  return (
    <div className="app-shell">
      {tutorialRunning && <div className="tutorial-dim" />}
      <Toaster />
      <div className="hero">
        <div className="brand">
          {logoSrc ? (
            <button className="logo-link" type="button" title="Open SD.Next on GitHub" onClick={() => void handleLogoClick()}>
              <img
                className="logo"
                src={logoSrc}
                alt="SD.Next"
                onError={() => {
                  setLogoAttempt((prev) => {
                    if (prev >= logoCandidates.length - 1) {
                      return prev;
                    }
                    return prev + 1;
                  });
                }}
              />
            </button>
          ) : null}
          <h1 className="brand-title" aria-label="SD.Next Launch" onClick={() => void toggleTheme()} title="Click to toggle theme (system/dark/light)">
            <span className="brand-title-main">SD.Next</span>
            <span className="brand-title-sub">launcher</span>
          </h1>
        </div>
        <div className="status-row">
          <div className="chip chip-version">
            <span>Version</span>
            {versionInfo.commitDate !== 'N/A' && (
              <>
                <span className="chip-value" style={{ fontSize: '12px' }}>
                  Date:{' '}
                  <span className="chip-inline-value" style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent-strong)' }}>
                    {versionInfo.commitDate}
                  </span>
                </span>
                <span className="chip-value" style={{ fontSize: '12px' }}>
                  Commit:{' '}
                  <a
                    href={`https://github.com/vladmandic/sdnext/commits/${versionInfo.branch}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: 'none',
                      color: 'var(--accent-strong)',
                      cursor: 'pointer',
                      fontFamily: 'Consolas, monospace',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    #{versionInfo.commitHash}
                  </a>
                </span>
                <span className="chip-value" style={{ fontSize: '12px' }}>
                  Branch:{' '}
                  <span className="chip-inline-value" style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent-strong)' }}>
                    {versionInfo.branch}
                  </span>
                </span>
              </>
            )}
            {versionInfo.commitDate === 'N/A' && (
              <span className="chip-value">
                {versionInfo.appVersion}
                {versionInfo.commitHash !== 'N/A' && ` (${versionInfo.commitHash})`}
              </span>
            )}
            {updateStatus === 'available' && (
              <span className="chip-value" style={{ fontSize: '12px', color: 'var(--accent-strong)', fontWeight: 500 }}>
                  {commitsBehind !== null && commitsBehind > 0
                    ? `Update available | ${commitsBehind} commit${commitsBehind === 1 ? '' : 's'}`
                    : 'Update available'}
              </span>
            )}
            {updateStatus === 'checking' && (
              <span className="chip-value" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Checking updates...
              </span>
            )}
          </div>
          <div className="chip chip-status">
            <span>Status</span>
            <strong className={isErrorStatus ? 'status-error' : undefined}>{formattedStatus}</strong>
          </div>
          <div className="chip chip-environment">
            <span>Environment</span>
            <span className="chip-value" style={{ fontSize: '12px' }}>
              Python:{' '}
              <span className="chip-inline-value" style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent-strong)' }}>
                {pythonDisplay}
              </span>
            </span>
            <span className="chip-value" style={{ fontSize: '12px' }}>
              Torch:{' '}
              <span className="chip-inline-value" style={{ fontFamily: 'Consolas, monospace', color: 'var(--accent-strong)' }}>
                {torchBackendInfo}
              </span>
            </span>
            <span className="chip-value">GPU: {gpuDisplay}</span>
          </div>
        </div>
      </div>

      <div className="controls-row">
        <button
          className={`icon-btn action-btn ${activeAction === 'bootstrap' ? 'is-running' : ''}`}
          onClick={() => void bootstrap()}
          disabled={busy || isInitializing || !startup.bootstrapAvailable}
          title="Bootstrap: unpack bundled tools or force reinstall"
          aria-label="Bootstrap"
        >
          <Wrench size={16} aria-hidden="true" />
        </button>
        <button
          className={`icon-btn action-btn ${activeAction === 'install' ? 'is-running' : ''}`}
          onClick={() => {
            void install();
          }}
          disabled={busy || isInitializing}
          title="Install application"
          aria-label="Install"
        >
          <Package size={16} aria-hidden="true" />
        </button>
        <button 
          className={`icon-btn action-btn ${activeAction === 'launch' ? 'is-running' : ''}`}
          onClick={launch} 
          disabled={busy || isInitializing || !bootstrapComplete || !startup.installed}
          title={!bootstrapComplete ? 'Launch: Install required first' : !startup.installed ? 'Launch: Not installed' : 'Launch application'}
          aria-label="Launch"
        >
          <Play size={16} aria-hidden="true" />
        </button>
        <button
          className="icon-btn action-btn"
          onClick={() => {
            if (browserUrl) {
              void window.sdnext.openExternal(browserUrl);
            }
          }}
          disabled={!browserUrl || !startup.status.startsWith('Ready')}
          title={browserUrl ? `Open browser to ${browserUrl}` : 'Open browser (not available)'}
          aria-label="Open browser"
        >
          <Chromium size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-btn action-btn danger"
          onClick={stop}
          disabled={!canStop}
          title="Stop active process"
          aria-label="Stop"
        >
          <Square size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-btn action-btn danger"
          onClick={() => {
            void exit();
          }}
          disabled={!canExit}
          title={canExit ? 'Exit launcher' : 'Exit available when launcher is idle'}
          aria-label="Exit"
        >
          <Power size={14} aria-hidden="true" />
        </button>

        <button
          className="btn ghost options-toggle"
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={advancedOpen}
          aria-controls="options-panel"
          title={advancedOpen ? 'Hide options' : 'Show options'}
        >
          {advancedOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          <SlidersHorizontal size={16} aria-hidden="true" />
          Options
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => startTutorial(true)}
          title="Show tutorial"
          aria-label="Tutorial"
        >
          <Info size={16} aria-hidden="true" />
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={toggleTheme}
          title="Switch theme"
          aria-label="Switch theme"
        >
          {isDarkTheme ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
      </div>

      <section id="options-panel" className="panel options-panel" hidden={!advancedOpen}>
        <div className="options-header">
          <h2 style={{ margin: 0 }}></h2>
          <div className="danger-actions" aria-label="Destructive maintenance actions">
            <button
              type="button"
              className={`btn ghost danger danger-action ${activeAction === 'wipe-venv' ? 'is-running' : ''}`}
              onClick={() => void wipeTarget('venv')}
              disabled={busy || isInitializing || !config.installationPath.trim()}
              title="Wipe venv folder"
            >
              <Trash2 size={15} aria-hidden="true" />
              Wipe venv
            </button>
            <button
              type="button"
              className={`btn ghost danger danger-action ${activeAction === 'wipe-bin' ? 'is-running' : ''}`}
              onClick={() => void wipeTarget('bin')}
              disabled={busy || isInitializing || !config.installationPath.trim()}
              title="Wipe bin folder"
            >
              <Trash2 size={15} aria-hidden="true" />
              Wipe bin
            </button>
            <button
              type="button"
              className={`btn ghost danger danger-action ${activeAction === 'wipe-app' ? 'is-running' : ''}`}
              onClick={() => void wipeTarget('app')}
              disabled={busy || isInitializing || !config.installationPath.trim()}
              title="Wipe app folder"
            >
              <Trash2 size={15} aria-hidden="true" />
              Wipe app
            </button>
          </div>
        </div>
        <div className="form-grid">
          <label className="form-label" title="Open browser with the SD.Next UI once it is started">
            <input
              className="form-input"
              type="checkbox"
              checked={config.autoLaunch}
              onChange={(e) => {
                const next = { ...config, autoLaunch: e.target.checked };
                setConfig(next);
                debouncedSaveConfig(next);
              }}
            />
            Auto-launch
          </label>

          <label className="form-label" title="Start app so it listens on all network interfaces">
            <input
              className="form-input"
              type="checkbox"
              checked={config.public}
              onChange={(e) => {
                const next = { ...config, public: e.target.checked };
                setConfig(next);
                debouncedSaveConfig(next);
              }}
            />
            Public
          </label>

          <label className="form-label" title="Upgrade SD.Next on the next startup">
            <input
              className="form-input"
              type="checkbox"
              checked={config.upgrade}
              onChange={(e) => {
                const next = { ...config, upgrade: e.target.checked };
                setConfig(next);
                debouncedSaveConfig(next);
              }}
            />
            Upgrade
          </label>

          <label className="form-label" title="Use UV parallel installer">
            <input
              className="form-input"
              type="checkbox"
              checked={config.useUv}
              onChange={(e) => {
                const next = { ...config, useUv: e.target.checked };
                setConfig(next);
                debouncedSaveConfig(next);
              }}
            />
            UV
          </label>

          <label className="form-label">
            Compute Backend
            <select
              className="form-select"
              value={config.backend}
              onChange={(e) => {
                const next = { ...config, backend: e.target.value as SdNextConfig['backend'] };
                setConfig(next);
                debouncedSaveConfig(next);
              }}
            >
              <option value="autodetect">Autodetect</option>
              <option value="cuda">nVidia CUDA</option>
              <option value="rocm">AMD ROCm</option>
              <option value="zluda">AMD Zluda</option>
              <option value="directml">DirectML</option>
              <option value="ipex">Intel Ipex</option>
              <option value="openvino">OpenVino</option>
            </select>
            {startup.recommendedBackend && config.backend !== startup.recommendedBackend && (
              <div style={{ fontSize: '0.85em', color: '#888', marginTop: '4px' }}>
                Suggested: {startup.recommendedBackend.toUpperCase()}
              </div>
            )}
          </label>

          <label className="form-label">
            Repository branch
            <select
              className="form-select"
              value={config.repositoryBranch}
              onChange={(e) => updateConfig('repositoryBranch', e.target.value as SdNextConfig['repositoryBranch'])}
              onBlur={() => {
                void persistConfig();
              }}
            >
              <option value="master">master</option>
              <option value="dev">dev</option>
            </select>
          </label>

          <label className="form-label">
            Installation path
            <div className="path-row">
              <input className="form-input" value={config.installationPath} onChange={(e) => updateConfig('installationPath', e.target.value)} onBlur={() => void persistConfig()} />
              <button type="button" className="btn ghost" onClick={() => void browseAndSet('installationPath')} title="Browse installation path">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>

          <label className="form-label">
            Models directory
            <div className="path-row">
              <input className="form-input" value={config.modelsPath} onChange={(e) => updateConfig('modelsPath', e.target.value)} onBlur={() => void persistConfig()} />
              <button type="button" className="btn ghost" onClick={() => void browseAndSet('modelsPath')} title="Browse models directory">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>

          <label className="form-label">
            Custom parameters
            <input className="form-input full-width" value={config.customParameters} onChange={(e) => updateConfig('customParameters', e.target.value)} onBlur={() => void persistConfig()} />
          </label>

          <label className="form-label">
            Custom environment
            <input className="form-input full-width" value={config.customEnvironment} onChange={(e) => updateConfig('customEnvironment', e.target.value)} onBlur={() => void persistConfig()} />
          </label>
        </div>
      </section>

      <div className="terminal-wrap">
        <div className="terminal-tabs" role="tablist" aria-label="Content tabs">
          <div className="tabs-buttons">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'terminal'}
              className={`btn ghost tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              Terminal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'docs'}
              className={`btn ghost tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
              onClick={() => setActiveTab('docs')}
            >
              Docs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'changelog'}
              className={`btn ghost tab-btn ${activeTab === 'changelog' ? 'active' : ''}`}
              onClick={() => setActiveTab('changelog')}
            >
              Changelog
            </button>
          </div>
          <div className="terminal-actions">
            <button className="icon-btn" onClick={() => void copySession()} title="Copy session">
              <Copy size={15} />
            </button>
            <button className="icon-btn" onClick={downloadSession} title="Download session">
              <Download size={15} />
            </button>
            <button className="icon-btn" onClick={clearTerminal} title="Clear terminal">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {activeTab === 'terminal' ? (
          <div className="tab-panel terminal-tab-panel" role="tabpanel">
            <ProgressBar
              gitFiles={extractionProgress.gitFiles}
              pythonFiles={extractionProgress.pythonFiles}
              isVisible={isBootstrapping && activeAction === 'bootstrap'}
              isComplete={startup.status === 'Bootstrap complete'}
            />
            <ProgressBar
              mode="install"
              installCompleted={installProgress.completed}
              installTotal={installProgress.total}
              isVisible={installProgress.visible}
              isComplete={false}
            />
            <LazyTerminalPanel
              lines={terminalLines}
              onDimensionsChange={handleTerminalDimensionsChange}
              isActive={activeTab === 'terminal'}
              isDarkTheme={isDarkTheme}
            />
          </div>
        ) : null}

        {activeTab === 'docs' ? (
          <div className="tab-panel" role="tabpanel">
            <iframe
              className="web-panel"
              src="https://vladmandic.github.io/sdnext-docs/"
              title="SD.Next Docs"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : null}

        {activeTab === 'changelog' ? (
          <div className="tab-panel changelog-panel" role="tabpanel">
            <div className="changelog-header">
              <span>Branch: {config.repositoryBranch}</span>
              <button
                type="button"
                className="btn ghost changelog-link"
                onClick={() => void window.sdnext.openExternal(changelogBlobUrl)}
                title="Open changelog on GitHub"
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open on GitHub
              </button>
            </div>

            {changelogLoading ? <div className="panel-message">Loading changelog...</div> : null}
            {changelogError ? <div className="panel-message error">{changelogError}</div> : null}
            {!changelogLoading && !changelogError ? (
              <div className="markdown-content" dangerouslySetInnerHTML={{ __html: changelogHtml }} />
            ) : null}
          </div>
        ) : null}
      </div>

      {confirmDialog?.open ? (
        <div className="modal-overlay" onClick={confirmDialog.onCancel}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <AlertTriangle size={24} aria-hidden="true" />
              <h3>Confirm Action</h3>
            </div>
            <div className="modal-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn ghost"
                onClick={confirmDialog.onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn ghost danger danger-action"
                onClick={confirmDialog.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
