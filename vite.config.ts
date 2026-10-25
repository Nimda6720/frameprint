import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages repository deployment. Override VITE_BASE_PATH for another repo.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'serve' && !isPreview ? '/' : (process.env.VITE_BASE_PATH || '/frameprint/'),
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
