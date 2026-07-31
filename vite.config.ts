import { defineConfig } from 'vitest/config';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
