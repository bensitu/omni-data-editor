import { readdir, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { run } from './process.mjs';
const publishing = process.argv.includes('--publish');
const channel =
  process.argv
    .find((value) => value.startsWith('--channel='))
    ?.slice('--channel='.length) ?? 'next';
if (!['latest', 'next', 'alpha'].includes(channel))
  throw new Error('Unsupported distribution channel.');
if (
  publishing &&
  (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.NPM_PUBLISH_ENABLED !== 'true')
)
  throw new Error(
    'Publishing requires the configured protected release workflow.',
  );
const destination = resolve('.cache/release');
await mkdir(destination, { recursive: true });
run('pnpm', ['run', 'check:packages']);
const archives = [];
for (const directory of await readdir('packages')) {
  const metadata = JSON.parse(
    await readFile(`packages/${directory}/package.json`, 'utf8'),
  );
  if (metadata.private) continue;
  if (publishing && !metadata.repository?.url)
    throw new Error(
      `Configure repository metadata before publishing ${metadata.name}.`,
    );
  if (publishing && channel === 'latest' && metadata.version.includes('-'))
    throw new Error('Stable publication requires a stable version.');
  if (
    publishing &&
    channel !== 'latest' &&
    !metadata.version.includes(`-${channel}.`)
  )
    throw new Error('The package version must match the prerelease channel.');
  run('pnpm', [
    '--dir',
    `packages/${directory}`,
    'pack',
    '--pack-destination',
    destination,
  ]);
  archives.push(
    `${destination}/${metadata.name.replace('@', '').replace('/', '-')}-${metadata.version}.tgz`,
  );
}
if (publishing)
  for (const archive of archives)
    run('npm', [
      'publish',
      archive,
      '--access',
      'public',
      '--provenance',
      '--tag',
      channel,
    ]);
console.log(
  publishing
    ? 'Configured package publication completed.'
    : 'Release archives prepared locally.',
);
