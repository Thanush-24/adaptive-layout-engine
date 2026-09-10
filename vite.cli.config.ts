import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

/**
 * Bundles `bin/ale.ts` (which imports the framework-agnostic engine and the
 * string renderers) into a single self-contained Node script at `dist/ale.mjs`.
 */
export default defineConfig({
  build: {
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'bin/ale.ts',
      formats: ['es'],
      fileName: () => 'ale.mjs',
    },
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { banner: '#!/usr/bin/env node' },
    },
    minify: false,
  },
})
