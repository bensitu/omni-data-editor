import { readdir, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { run } from './process.mjs';
const destination = resolve('.cache/packages');
await mkdir(destination, { recursive: true });
for (const directory of await readdir('packages')) {
  const metadata = JSON.parse(
    await readFile(`packages/${directory}/package.json`, 'utf8'),
  );
  if (metadata.private) continue;
  run('pnpm', ['exec', 'publint', `packages/${directory}`]);
  run(
    'pnpm',
    [
      '--dir',
      `packages/${directory}`,
      'pack',
      '--pack-destination',
      destination,
    ],
    undefined,
    { stdio: 'pipe' },
  );
  const tarball = `${destination}/${metadata.name.replace('@', '').replace('/', '-')}-${metadata.version}.tgz`;
  const entries = run('tar', ['-tf', tarball], undefined, {
    stdio: 'pipe',
    encoding: 'utf8',
  }).stdout;
  assert(
    entries.includes('package/LICENSE') &&
      entries.includes('package/README.md'),
  );
  assert(
    !/\.cjs\b|\.planning\/|OmniDataEditor_/.test(entries),
    `Unexpected package content: ${metadata.name}`,
  );
  const packed = JSON.parse(
    run('tar', ['-xOf', tarball, 'package/package.json'], undefined, {
      stdio: 'pipe',
      encoding: 'utf8',
    }).stdout,
  );
  assert(!JSON.stringify(packed).includes('workspace:'));
  if (directory !== 'theme-default')
    run('pnpm', ['exec', 'attw', tarball, '--profile', 'esm-only', '--quiet']);
}
console.log(
  'Public tarball contents, metadata and ESM type resolution passed.',
);
