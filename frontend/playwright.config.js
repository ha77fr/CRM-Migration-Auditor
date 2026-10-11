import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const frontendDir = fileURLToPath(new URL('.', import.meta.url));
const repositoryDir = fileURLToPath(new URL('..', import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), 'crm-auditor-e2e-'));

// Playwright stops both web servers before exiting, including on a failed test.
process.once('exit', () => rmSync(dataDir, { recursive: true, force: true, maxRetries: 10 }));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'python -m uvicorn main:app --host 127.0.0.1 --port 8765',
      cwd: repositoryDir,
      url: 'http://127.0.0.1:8765/health/ready',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        AUDITOR_DATABASE_URL: `sqlite:///${join(dataDir, 'auditor.db').replaceAll('\\', '/')}`,
        AUDITOR_STORAGE_DIR: join(dataDir, 'uploads'),
        AUDITOR_TASK_BACKEND: 'local',
        AUDITOR_AUTO_CREATE_SCHEMA: 'true',
        AUDITOR_API_KEY: '',
        AUDITOR_MAX_UPLOAD_BYTES: '5242880',
        AUDITOR_MAX_ROWS: '25000',
        AUDITOR_MAX_FINDINGS: '1000',
      },
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
      cwd: frontendDir,
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        API_PROXY_TARGET: 'http://127.0.0.1:8765',
        API_PROXY_KEY: '',
      },
    },
  ],
});
