import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.js',workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:4174',browserName:'chromium',launchOptions:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:4174/Controle-Chaparia/',reuseExistingServer:!process.env.CI}
});
