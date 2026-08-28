import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ---- Build metadata (surfaced in the sticky footer) -----------------------
function sh(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const version: string = pkg.version;
// Incremental build number: CI run number if present, else the git commit count.
const buildNumber = String(process.env.GITHUB_RUN_NUMBER || sh('git rev-list --count HEAD', '0'));
// Build ID: short commit sha (unique per build).
const buildId = sh('git rev-parse --short HEAD', 'local');
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works at any sub-path (e.g. GitHub Pages
  // project site /RITHI_CRM/) without hard-coding the repo name.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    port: 5173,
    host: true,
  },
});
