import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/frameprint/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name:'desktop', use:{...devices['Desktop Chrome'],channel:process.env.PLAYWRIGHT_CHANNEL} },
    { name:'mobile', use:{...devices['Pixel 7'],defaultBrowserType:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL} },
  ],
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1',
    url:'http://127.0.0.1:4173/frameprint/',reuseExistingServer:!process.env.CI,
  },
});
