import { run } from './process.mjs';
run('pnpm', ['-r', 'run', 'typecheck']);
run('pnpm', ['exec', 'tsc', '--noEmit']);
