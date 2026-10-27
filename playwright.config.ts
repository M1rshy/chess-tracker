import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',timeout:90000,expect:{timeout:30000},fullyParallel:false,workers:1,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:5173',channel:process.env.CHROMIUM_PATH?undefined:(process.env.PLAYWRIGHT_CHANNEL||'chrome'),launchOptions:process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:undefined,headless:true,trace:'retain-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
});
