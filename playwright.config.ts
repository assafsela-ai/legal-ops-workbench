import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests', testMatch: '*.spec.ts', workers: 1, timeout: 30_000,
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: [
    { command: 'npm run dev -- --port 4179 --strictPort', url: 'http://127.0.0.1:4179/', timeout: 30_000 },
    { command: 'npm start', env: { PORT: '4180', WORKBENCH_DATA: 'test-results/local-db' }, url: 'http://127.0.0.1:4180/', timeout: 30_000 },
  ],
})
