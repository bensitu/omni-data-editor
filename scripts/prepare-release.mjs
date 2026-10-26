import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { run } from './process.mjs';
import {
  archiveName,
  capture,
  integrity,
  readPackages,
  releaseNotes,
  repository,
  sha256,
  validatePackages,
  verifyReleaseArtifacts,
} from './release-utils.mjs';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    'check-version': { type: 'boolean' },
  },
});
const packages = await readPackages();
const version = validatePackages(packages, values.version);
const tag = `v${version}`;
const notes = releaseNotes({
  version,
  changelog: await readFile('CHANGELOG.md', 'utf8'),
});
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntag=${tag}\n`,
  );
if (values['check-version']) {
  console.log(`All ${packages.length} public packages use version ${version}.`);
} else {
  run('pnpm', ['run', 'check:packages']);
  const destination = resolve('.cache/release');
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name.endsWith('.tgz') ||
        ['release-manifest.json', 'SHA256SUMS', 'release-notes.md'].includes(
          entry.name,
        ))
    )
      await unlink(resolve(destination, entry.name));
  }
  const artifacts = [];
  for (const item of packages) {
    const changelog = await readFile(
      `packages/${item.directory}/CHANGELOG.md`,
      'utf8',
    );
    const section = changelog
      .split(/^## /m)
      .slice(1)
      .find((part) => part.split('\n')[0].trim() === version);
    if (!section || !section.slice(section.indexOf('\n') + 1).trim())
      throw new Error(
        `Package changelog has no release notes for ${item.name}@${version}.`,
      );
    run(
      'pnpm',
      [
        '--dir',
        `packages/${item.directory}`,
        'pack',
        '--pack-destination',
        destination,
      ],
      undefined,
      { stdio: 'pipe' },
    );
    const filename = archiveName(item);
    const bytes = await readFile(resolve(destination, filename));
    artifacts.push({
      name: item.name,
      version,
      filename,
      sha256: sha256(bytes),
      integrity: integrity(bytes),
    });
  }
  const manifest = {
    schemaVersion: 1,
    repository,
    version,
    commit: capture('git', ['rev-parse', 'HEAD']),
    artifacts,
  };
  await writeFile(
    resolve(destination, 'release-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await writeFile(
    resolve(destination, 'SHA256SUMS'),
    artifacts
      .map((item) => `${item.sha256}  ${item.filename}`)
      .sort()
      .join('\n') + '\n',
  );
  await writeFile(resolve(destination, 'release-notes.md'), notes);
  await verifyReleaseArtifacts(destination, manifest, packages, version);
  console.log(
    `Prepared and verified ${artifacts.length} release archives in ${destination}.`,
  );
}
