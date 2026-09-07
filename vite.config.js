import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, headers: {
    'Permissions-Policy': 'camera=*, microphone=*, gyroscope=*, accelerometer=*, magnetometer=*'
  } },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] }
});
