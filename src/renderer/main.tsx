const DEBUG = new URLSearchParams(window.location.search).has('debug') || localStorage.getItem('debug') === 'true';

function log(msg: string, data?: unknown) {
  const time = new Date().toISOString();
  const prefix = `${time}:[renderer]`;
  if (data) {
    console.log(prefix, msg, data);
  } else {
    console.log(prefix, msg);
  }
}

if (DEBUG) log('[STARTUP] main.tsx script started');

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import '@xterm/xterm/css/xterm.css';

if (DEBUG) log('[STARTUP] Imports completed');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

if (DEBUG) log('[STARTUP] Creating React root...');
const root = createRoot(rootElement);

if (DEBUG) log('[STARTUP] Rendering App component...');
const renderStart = performance.now();
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
const renderEnd = performance.now();
if (DEBUG) log('[STARTUP] Initial render completed', { duration: `${(renderEnd - renderStart).toFixed(2)}ms` });
