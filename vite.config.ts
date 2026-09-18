import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The preview harness may assign a port through PORT when 5173 is taken.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  plugins: [react()],
  server: { port: Number(env.PORT) || 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
