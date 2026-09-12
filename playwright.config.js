const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1, timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    reducedMotion: 'reduce', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve.js', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }
});
