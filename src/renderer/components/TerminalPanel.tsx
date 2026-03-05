import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TerminalPanelProps {
  lines: string[];
  onDimensionsChange?: (cols: number, rows: number) => void;
}

export function TerminalPanel({ lines, onDimensionsChange }: TerminalPanelProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const renderedCountRef = useRef(0);

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    const terminal = new Terminal({
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      rows: 18,
      convertEol: true,
      scrollback: 10000,
      allowTransparency: false,
      theme: {
        background: '#0f1115',
        foreground: '#d9e1ee',
        cursor: '#d9e1ee',
        cursorAccent: '#0f1115',
        selectionBackground: 'rgba(71, 133, 133, 0.3)',
        black: '#000000',
        red: '#ff7b7b',
        green: '#7bff7b',
        yellow: '#ffff7b',
        blue: '#7b7bff',
        magenta: '#ff7bff',
        cyan: '#7bffff',
        white: '#d9e1ee',
        brightBlack: '#666666',
        brightRed: '#ffaaaa',
        brightGreen: '#aaffaa',
        brightYellow: '#ffffaa',
        brightBlue: '#aaaaff',
        brightMagenta: '#ffaaff',
        brightCyan: '#aaffff',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mountRef.current);

    const safeFit = (): void => {
      if (!mountRef.current || !terminalRef.current) {
        return;
      }

      // FitAddon can throw during early lifecycle/race windows in dev StrictMode.
      try {
        fitAddon.fit();
        // Notify parent of dimension changes
        if (onDimensionsChange) {
          onDimensionsChange(terminalRef.current.cols, terminalRef.current.rows);
        }
      } catch {
        // Ignore transient fit errors; next resize/event will retry.
      }
    };

    terminalRef.current = terminal;

    requestAnimationFrame(() => {
      safeFit();
    });

    const resizeObserver = new ResizeObserver(() => {
      safeFit();
    });
    resizeObserver.observe(mountRef.current);

    return () => {
      resizeObserver.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, [onDimensionsChange]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (lines.length < renderedCountRef.current) {
      terminal.reset();
      renderedCountRef.current = 0;
    }

    for (let i = renderedCountRef.current; i < lines.length; i += 1) {
      terminal.write(lines[i]);
    }

    renderedCountRef.current = lines.length;
  }, [lines]);

  return <div className="terminal-panel" ref={mountRef} />;
}
