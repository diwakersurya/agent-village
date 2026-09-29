import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['daemon/test/**/*.test.ts', 'web/test/**/*.test.ts'] },
});
