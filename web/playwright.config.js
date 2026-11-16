import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'phone', use: { ...devices['Pixel 5'] } }],
  webServer: {
    command: 'node src/server.js',
    url: 'http://localhost:3100/api/catalog?limit=1',
    reuseExistingServer: !process.env.CI,
    env: { PORT: '3100', EVENTS_FILE: './data/e2e-events.jsonl' },
  },
});
