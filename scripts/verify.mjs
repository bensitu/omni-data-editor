import { run } from './process.mjs';
for (const script of [
  'format:check',
  'lint',
  'build',
  'build:examples',
  'typecheck',
  'test',
  'test:browser',
  'test:e2e',
  'check:packages',
  'check:artifacts',
  'check:bundles',
  'test:consumer',
  'docs:api',
  'docs:build',
])
  run('pnpm', ['run', script]);
