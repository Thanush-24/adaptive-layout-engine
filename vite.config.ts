/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'bin/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/render/**'],
    },
  },
})
