import { createVitest } from 'vitest/node';
import { mkdtemp } from 'node:fs/promises';
const context = await createVitest('test', { run: true, config: 'verify.config.ts' });
// Local verification only: sandbox Temp disallows rename; use workspace scratch.
const directory = await mkdtemp(new URL('./vitest-temp-', import.meta.url));
context._tmpDir = directory;
for (const project of [context.getRootProject(), ...context.projects]) project.tmpDir = directory;
try { await context.start(); } finally { await context.close(); }
