import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Package,
  Play,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { SdNextConfig, StartupState, TerminalDimensions, UiStatus } from '../shared/types';
import { TerminalPanel } from './components/TerminalPanel';

const defaultStartupState: StartupState = {
  logoPath: '',
  installed: false,
  version: 'N/A',
  status: 'Idle',
  tools: {
    python: 'N/A',
    git: 'N/A',
  },
  gpus: [],
  recommendedBackend: 'autodetect',
};

const defaultConfig: SdNextConfig = {
  autoLaunch: false,
  upgrade: false,
  reinstall: false,
  wipe: false,
  backend: 'autodetect',
  repositoryBranch: 'dev',
  installationPath: '',
  modelsPath: '',
  customParameters: '',
  customEnvironment: '',
};

const isBootstrapStatus = (status: UiStatus): boolean => {
  return (
    status === 'Initializing...' ||
    status === 'Bootstrapping...' ||
    status === 'Unpacking Git...' ||
    status === 'Unpacking Python...'
  );
};

const isBusyStatus = (status: UiStatus): boolean => {
  return (
    isBootstrapStatus(status) ||
    status === 'Installing...' ||
    status === 'Cloning repository...' ||
    status === 'Creating VENV...' ||
    status === 'Installing dependencies...' ||
    status === 'Running...'
  );
};

const normalizeTerminalChunk = (text: string): string => {
  // Normalize carriage-return updates into plain newlines for consistent xterm rendering.
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
  const [logoAttempt, setLogoAttempt] = useState(0);
  const [changelogHtml, setChangelogHtml] = useState('');
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // Follow system preference by default.
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.style.colorScheme = 'light';
    }
  }, [darkMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      setDarkMode(event.matches);
    };

    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, []);

  const refreshStartup = async (): Promise<void> => {
    const startupState = await window.sdnext.getStartupState();
    setStartup(startupState);
    return;
  };

  useEffect(() => {
    // Set up listeners immediately (non-blocking)
    const removeTerminalListener = window.sdnext.onTerminalOutput((event) => {
      setTerminalLines((prev) => [...prev, normalizeTerminalChunk(event.text)]);
    });

    const removeStatusListener = window.sdnext.onStatus((status: UiStatus) => {
      setStartup((prev) => ({ ...prev, status }));
      setBusy(isBusyStatus(status));
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

    // Load config and startup state asynchronously (after UI renders)
    void Promise.all([window.sdnext.getStartupState(), window.sdnext.loadConfig()]).then(([startupState, loadedConfig]) => {
      setStartup(startupState);
      // Always reset wipe to false for safety (destructive operation should not persist)
      setConfig({ ...loadedConfig, wipe: false });
    });

    return () => {
      removeTerminalListener();
      removeStatusListener();
      removeVersionListener();
      removeGPUListener();
      removeToolsListener();
    };
  }, []);

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

  const versionLabel = useMemo(() => startup.version || 'N/A', [startup.version]);
  const isInitializing = useMemo(() => startup.status === 'Initializing...', [startup.status]);
  const isBootstrapping = useMemo(() => isBootstrapStatus(startup.status), [startup.status]);
  const isErrorStatus = useMemo(() => startup.status.startsWith('Error:'), [startup.status]);
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
    return (
      isBootstrapStatus(startup.status) ||
      startup.status === 'Installing...' ||
      startup.status === 'Cloning repository...' ||
      startup.status === 'Creating VENV...' ||
      startup.status === 'Installing dependencies...' ||
      startup.status === 'Running...'
    );
  }, [startup.status]);

  const bootstrapProgress = useMemo(() => {
    switch (startup.status) {
      case 'Initializing...':
        return { label: 'Preparing bootstrap...', value: 10 };
      case 'Bootstrapping...':
        return { label: 'Starting unpack process...', value: 25 };
      case 'Unpacking Git...':
        return { label: 'Unpacking Git runtime...', value: 55 };
      case 'Unpacking Python...':
        return { label: 'Unpacking Python runtime...', value: 85 };
      case 'Bootstrap complete':
        return { label: 'Bootstrap complete', value: 100 };
      default:
        return null;
    }
  }, [startup.status]);

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

  const gpuDisplay = useMemo(() => {
    if (startup.gpus.length === 0) {
      return 'No GPU detected';
    }
    return startup.gpus.map((gpu, index) => `${index}:${gpu.name}`).join(' | ');
  }, [startup.gpus]);

  const updateConfig = <K extends keyof SdNextConfig>(key: K, value: SdNextConfig[K]): void => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

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
    setBusy(true);
    setTerminalLines([]);
    const result = await window.sdnext.install(config, {
      upgrade: config.upgrade,
      reinstall: config.reinstall || config.wipe,
      wipe: config.wipe,
      backend: config.backend,
    }, terminalDimensions);
    if (result.success) {
      await refreshStartup();
    }
  };

  const bootstrap = async (): Promise<void> => {
    setBusy(true);
    setTerminalLines([]);
    await window.sdnext.startBootstrap();
    // Poll for completion
    const pollInterval = setInterval(async () => {
      await refreshStartup();
      const state = await window.sdnext.getStartupState();
      if (!isBootstrapStatus(state.status)) {
        clearInterval(pollInterval);
        setBusy(false);
      }
    }, 500);
  };

  const start = async (): Promise<void> => {
    setBusy(true);
    setTerminalLines([]);
    await window.sdnext.start(config, terminalDimensions);
  };

  const stop = async (): Promise<void> => {
    await window.sdnext.stop();
  };

  const copySession = async (): Promise<void> => {
    await navigator.clipboard.writeText(terminalLines.join(''));
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
    downloadTextFile('sdnext-session.log', terminalLines.join(''));
  };

  const clearTerminal = (): void => {
    setTerminalLines([]);
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
          <h1>SD.Next Launcher</h1>
        </div>
        <div className="status-row">
          <div className="chip">
            <span>Version</span>
            <strong>{versionLabel}</strong>
          </div>
          <div className="chip">
            <span>Status</span>
            <strong className={isErrorStatus ? 'status-error' : undefined}>{startup.status}</strong>
          </div>
          <div className="chip">
            <span>Environment</span>
            <span className="chip-value">Python: {startup.tools.python}</span>
            <span className="chip-value">GPU: {gpuDisplay}</span>
          </div>
        </div>
      </div>

      <div className="controls-row">
        <button
          className="icon-btn action-btn"
          onClick={() => void bootstrap()}
          disabled={busy || isInitializing || !bootstrapNeeded}
          title={bootstrapNeeded ? 'Bootstrap: unpack bundled tools' : 'Bootstrap: Tools already available'}
          aria-label="Bootstrap"
        >
          <Wrench size={16} aria-hidden="true" />
        </button>
        <button
          className="icon-btn action-btn"
          onClick={() => {
            void install();
          }}
          disabled={busy || isInitializing || !bootstrapComplete || startup.installed}
          title={!bootstrapComplete ? 'Install: Bootstrap required first' : startup.installed ? 'Already installed' : 'Install application'}
          aria-label="Install"
        >
          <Package size={16} aria-hidden="true" />
        </button>
        <button 
          className="icon-btn action-btn"
          onClick={start} 
          disabled={busy || isInitializing || !bootstrapComplete || !startup.installed}
          title={!bootstrapComplete ? 'Start: Install required first' : !startup.installed ? 'Start: Not installed' : 'Start application'}
          aria-label="Start"
        >
          <Play size={16} aria-hidden="true" />
        </button>
        <button
          className="ghost danger icon-btn action-btn"
          onClick={stop}
          disabled={!canStop}
          title="Stop active process"
          aria-label="Stop"
        >
          <Square size={14} aria-hidden="true" />
        </button>

        <button
          className="ghost options-toggle"
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={advancedOpen}
          aria-controls="options-panel"
          title={advancedOpen ? 'Hide options' : 'Show options'}
        >
          {advancedOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          Options
        </button>
      </div>

      {bootstrapProgress ? (
        <div className="bootstrap-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bootstrapProgress.value} title={bootstrapProgress.label}>
          <div className="bootstrap-progress-track" aria-hidden="true">
            <div className="bootstrap-progress-fill" style={{ width: `${bootstrapProgress.value}%` }} />
          </div>
        </div>
      ) : null}

      <section id="options-panel" className="panel options-panel" hidden={!advancedOpen}>
        <div className="form-grid">
          <label title="Open browser with the SD.Next UI once it is started">
            <input
              type="checkbox"
              checked={config.autoLaunch}
              onChange={async (e) => {
                const next = { ...config, autoLaunch: e.target.checked };
                setConfig(next);
                await window.sdnext.saveConfig(next);
              }}
            />
            Auto-launch
          </label>

          <label title="Upgrade SD.Next on the next startup">
            <input
              type="checkbox"
              checked={config.upgrade}
              onChange={async (e) => {
                const next = { ...config, upgrade: e.target.checked };
                setConfig(next);
                await window.sdnext.saveConfig(next);
              }}
            />
            Upgrade
          </label>

          <label title="Force reinstall of all SD.Next requirements on the next startup">
            <input
              type="checkbox"
              checked={config.reinstall || config.wipe}
              disabled={config.wipe}
              onChange={async (e) => {
                const next = { ...config, reinstall: e.target.checked };
                setConfig(next);
                await window.sdnext.saveConfig(next);
              }}
            />
            Reinstall
          </label>

          <label title="Wipe existing SD.Next installation before startup">
            <input
              type="checkbox"
              checked={config.wipe}
              onChange={async (e) => {
                const next = { ...config, wipe: e.target.checked, reinstall: e.target.checked ? true : config.reinstall };
                setConfig(next);
                await window.sdnext.saveConfig(next);
              }}
            />
            Wipe
          </label>

          <label>
            Compute Backend
            {startup.recommendedBackend && config.backend !== startup.recommendedBackend && (
              <div style={{ fontSize: '0.85em', color: '#888', marginBottom: '4px' }}>
                Suggested: {startup.recommendedBackend.toUpperCase()}
              </div>
            )}
            <select
              value={config.backend}
              onChange={async (e) => {
                const next = { ...config, backend: e.target.value as SdNextConfig['backend'] };
                setConfig(next);
                await window.sdnext.saveConfig(next);
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
          </label>

          <label>
            Repository branch
            <select
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

          <label>
            Installation path
            <div className="path-row">
              <input value={config.installationPath} onChange={(e) => updateConfig('installationPath', e.target.value)} onBlur={() => void persistConfig()} />
              <button type="button" className="ghost" onClick={() => void browseAndSet('installationPath')} title="Browse installation path">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>

          <label>
            Models directory
            <div className="path-row">
              <input value={config.modelsPath} onChange={(e) => updateConfig('modelsPath', e.target.value)} onBlur={() => void persistConfig()} />
              <button type="button" className="ghost" onClick={() => void browseAndSet('modelsPath')} title="Browse models directory">
                <FolderOpen size={15} />
              </button>
            </div>
          </label>

          <label>
            Custom parameters
            <input value={config.customParameters} onChange={(e) => updateConfig('customParameters', e.target.value)} onBlur={() => void persistConfig()} />
          </label>

          <label>
            Custom environment
            <input value={config.customEnvironment} onChange={(e) => updateConfig('customEnvironment', e.target.value)} onBlur={() => void persistConfig()} />
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
              className={`ghost tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              Terminal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'docs'}
              className={`ghost tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
              onClick={() => setActiveTab('docs')}
            >
              Docs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'changelog'}
              className={`ghost tab-btn ${activeTab === 'changelog' ? 'active' : ''}`}
              onClick={() => setActiveTab('changelog')}
            >
              Changelog
            </button>
          </div>
          <div className="terminal-actions">
            <button className="ghost icon-btn" onClick={() => void copySession()} title="Copy session">
              <Copy size={15} />
            </button>
            <button className="ghost icon-btn" onClick={downloadSession} title="Download session">
              <Download size={15} />
            </button>
            <button className="ghost icon-btn" onClick={clearTerminal} title="Clear terminal">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {activeTab === 'terminal' ? (
          <div className="tab-panel terminal-tab-panel" role="tabpanel">
            <TerminalPanel lines={terminalLines} onDimensionsChange={handleTerminalDimensionsChange} />
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
                className="ghost changelog-link"
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
    </div>
  );
}
