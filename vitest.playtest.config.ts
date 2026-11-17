import { defineConfig } from 'vitest/config';

// `npm run playtest`: the balance harness, kept out of the normal test run.
export default defineConfig({ test: { include: ['scripts/playtest.test.ts'], testTimeout: 600000 } });
