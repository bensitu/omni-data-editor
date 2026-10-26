import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { run as execute } from './process.mjs';
import { resolve } from 'node:path';
const run = (args, cwd = process.cwd()) => execute('pnpm', args, cwd);
const target = resolve('.cache/contracts');
const { version } = JSON.parse(
  await readFile('packages/core/package.json', 'utf8'),
);
await mkdir(target, { recursive: true });
run(['--filter', '@omnidataeditor/core', 'pack', '--pack-destination', target]);
await writeFile(
  `${target}/package.json`,
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@omnidataeditor/core': `file:./omnidataeditor-core-${version}.tgz`,
    },
  }),
);
await copyFile('tests/consumer-smoke/contracts.ts', `${target}/contracts.ts`);
await writeFile(
  `${target}/tsconfig.json`,
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      types: ['node'],
      ignoreDeprecations: '6.0',
    },
    include: ['contracts.ts'],
  }),
);
run(['install', '--ignore-workspace', '--ignore-scripts'], target);
run(['exec', 'tsc', '-p', target]);
