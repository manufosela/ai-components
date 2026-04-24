import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['packages/*/test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.js'],
      exclude: ['**/dist/**', '**/node_modules/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
