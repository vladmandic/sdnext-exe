import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Exclude large directories from file watching to improve HMR startup speed
    watch: {
      ignored: ['**/node_modules/**', '**/sdnext/**', '**/.git/**', '**/dist/**'],
    },
  },
  optimizeDeps: {
    exclude: ['sdnext', 'portable'],
    entries: ['src/**/*.{ts,tsx}', 'index.html'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'xterm-vendor': ['@xterm/xterm', '@xterm/addon-fit'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  esbuild: {
    legalComments: 'none',
    treeShaking: true,
  },
});
