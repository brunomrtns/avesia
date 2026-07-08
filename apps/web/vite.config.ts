import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Avesia',
        short_name: 'Avesia',
        description: 'Plataforma de inteligência clínica',
        theme_color: '#0d9488',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
      },
    }),
  ],
  // In production, the SPA is served under /avesia/ prefix.
  // In dev, Vite serves from root.
  base: process.env.NODE_ENV === 'production' ? '/avesia/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3101,
    host: true,
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '../../packages/**',
        '../../apps/api/**',
        '../../apps/worker/**',
      ],
    },
    proxy: {
      '/avesia/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/avesia\/api/, ''),
      },
    },
  },
  build: {
    outDir: './dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'radix-vendor': [
            '@radix-ui/react-avatar',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-switch',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-progress',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-popover',
          ],
          'motion-vendor': ['motion'],
          'charts-vendor': ['recharts'],
          'd3-vendor': ['d3-force'],
          'utils-vendor': ['date-fns', 'zod', 'react-hook-form', '@hookform/resolvers', 'cmdk', 'zustand', 'sonner', 'lucide-react'],
        },
      },
    },
  },
});
