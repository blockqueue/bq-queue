import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [join(__dirname, 'tests', 'setup.ts')],
    include: ['tests/**/*.test.ts'],
  },
});
