import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // three.js alone is ~600 kB minified; fine for a prototype.
  build: { chunkSizeWarningLimit: 900 },
  server: { host: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
