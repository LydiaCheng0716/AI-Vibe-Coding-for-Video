import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['src/**'],
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        'tests/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.d.ts',
        '*.config.*',
        'postcss.config.js',
        'tailwind.config.js',
        'index.html',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 82,
        functions: 78,
        lines: 70,
      },
    },
  },
});
