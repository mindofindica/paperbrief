import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'app/**/*.test.ts', 'app/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts', 'lib/**/*.tsx'],
      exclude: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    },
  },
  resolve: {
    alias: {
      '@paperbrief/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
    extensions: ['.ts', '.tsx', '.js'],
  },
});
