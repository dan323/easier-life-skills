import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['installer/tests/logic.test.ts', 'installer/tests/actions.test.ts'],
    globals: false,
    testTimeout: 20000,
  },
});
