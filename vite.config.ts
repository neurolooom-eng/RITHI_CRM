import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works at any sub-path (e.g. GitHub Pages
  // project site /RITHI_CRM/) without hard-coding the repo name.
  base: './',
  server: {
    port: 5173,
    host: true,
  },
});
