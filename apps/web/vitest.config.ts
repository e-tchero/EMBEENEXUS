import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The real 'server-only' package throws outside React Server Component
      // environments; stub it so server modules are unit-testable.
      'server-only': path.resolve(__dirname, './test/stubs/server-only.ts'),
    },
  },
});
