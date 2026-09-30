import { defineConfig, devices } from '@playwright/test';

// Mobile viewport by default: the phone experience is the primary target.
export default defineConfig({
  testDir: 'e2e',
  // All tests share one server and one stage (active scene, mode, music), so they run one at a time.
  workers: 1,
  webServer: {
    command: 'npm run build && PORT=3100 node server/index.js',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  use: { baseURL: 'http://localhost:3100' },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        // Optional: point at a preinstalled Chromium instead of Playwright's own.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
