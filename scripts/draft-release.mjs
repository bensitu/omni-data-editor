import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prerelease } from 'semver';
import { parseArgs } from 'node:util';
import {
  capture,
  readPackages,
  releaseVersion,
  repository,
  requireReleaseWorkflow,
  verifyReleaseArtifacts,
} from './release-utils.mjs';
import { run } from './process.mjs';

requireReleaseWorkflow();
const { values } = parseArgs({ options: { version: { type: 'string' } } });
const version = releaseVersion(values.version);
const tag = `v${version}`;
const directory = resolve('.cache/release');
const manifest = JSON.parse(
  await readFile(resolve(directory, 'release-manifest.json'), 'utf8'),
);
const source = capture('git', ['rev-parse', 'HEAD']);
if (
  source !== process.env.GITHUB_SHA ||
  capture('git', ['status', '--porcelain'])
)
  throw new Error(
    'Draft releases require the unchanged workflow source commit.',
  );
const artifacts = await verifyReleaseArtifacts(
  directory,
  manifest,
  await readPackages(),
  version,
  source,
);
const existingTags = JSON.parse(
  capture('gh', ['api', `repos/${repository}/git/matching-refs/tags/${tag}`]),
);
if (existingTags.some((item) => item.ref === `refs/tags/${tag}`))
  throw new Error(`Tag ${tag} already exists.`);
const releases = JSON.parse(
  capture('gh', [
    'api',
    '--paginate',
    '--slurp',
    `repos/${repository}/releases?per_page=100`,
  ]),
).flat();
if (releases.some((item) => item.tag_name === tag))
  throw new Error(`Release ${tag} already exists.`);
const tagObject = JSON.parse(
  capture('gh', [
    'api',
    '--method',
    'POST',
    `repos/${repository}/git/tags`,
    '-f',
    `tag=${tag}`,
    '-f',
    `message=Release ${tag}`,
    '-f',
    `object=${source}`,
    '-f',
    'type=commit',
  ]),
);
capture('gh', [
  'api',
  '--method',
  'POST',
  `repos/${repository}/git/refs`,
  '-f',
  `ref=refs/tags/${tag}`,
  '-f',
  `sha=${tagObject.sha}`,
]);
try {
  run('gh', [
    'release',
    'create',
    tag,
    ...artifacts.map((item) => item.path),
    resolve(directory, 'SHA256SUMS'),
    resolve(directory, 'release-manifest.json'),
    '--repo',
    repository,
    '--verify-tag',
    '--draft',
    '--title',
    tag,
    '--notes-file',
    resolve(directory, 'release-notes.md'),
    ...(prerelease(version) ? ['--prerelease'] : []),
  ]);
} catch (error) {
  const currentReleases = JSON.parse(
    capture('gh', [
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/releases?per_page=100`,
    ]),
  ).flat();
  if (!currentReleases.some((item) => item.tag_name === tag)) {
    const currentTag = JSON.parse(
      capture('gh', ['api', `repos/${repository}/git/ref/tags/${tag}`]),
    );
    if (currentTag.object.sha === tagObject.sha)
      capture('gh', [
        'api',
        '--method',
        'DELETE',
        `repos/${repository}/git/refs/tags/${tag}`,
      ]);
  }
  throw error;
}
