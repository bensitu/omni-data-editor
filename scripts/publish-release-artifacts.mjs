import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gt } from 'semver';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from './process.mjs';
import {
  capture,
  readPackages,
  repository,
  requireReleaseWorkflow,
  validateReleaseTag,
  verifyReleaseArtifacts,
} from './release-utils.mjs';

export function verifyPublishedArtifact(artifact, metadata, tag) {
  if (
    !metadata ||
    metadata.name !== artifact.name ||
    metadata.version !== artifact.version ||
    metadata.integrity !== artifact.integrity
  )
    throw new Error(
      `Published package does not match the release archive: ${artifact.name}@${artifact.version}.`,
    );
  if (tag && metadata.tagVersion !== artifact.version)
    throw new Error(
      `Distribution tag ${tag} does not point to ${artifact.name}@${artifact.version}.`,
    );
}

export async function publishReleaseArtifacts(
  artifacts,
  { inspect, publish, tag, wait = delay, attempts = 12, onStatus = () => {} },
) {
  if (
    !artifacts.length ||
    new Set(artifacts.map((item) => item.name)).size !== artifacts.length
  )
    throw new Error('Release packages must be nonempty and unique.');
  const existing = await Promise.all(artifacts.map(inspect));
  existing.forEach((metadata, index) => {
    if (metadata) verifyPublishedArtifact(artifacts[index], metadata, tag);
  });
  async function verifyAvailable(artifact) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const metadata = await inspect(artifact);
      if (metadata) {
        verifyPublishedArtifact(artifact, metadata);
        if (metadata.tagVersion === artifact.version) return;
      }
      if (attempt + 1 < attempts) await wait(5000);
    }
    throw new Error(
      `The published version and distribution tag are not available: ${artifact.name}.`,
    );
  }
  for (let index = 0; index < artifacts.length; index++) {
    const artifact = artifacts[index];
    if (existing[index]) onStatus(artifact, 'already verified');
    else {
      await publish(artifact);
      await verifyAvailable(artifact);
      onStatus(artifact, 'published');
    }
  }
  for (const artifact of artifacts) await verifyAvailable(artifact);
}

async function publishCli() {
  requireReleaseWorkflow();
  const { values } = parseArgs({
    options: { version: { type: 'string' }, tag: { type: 'string' } },
  });
  const { version, tag } = validateReleaseTag(values.version, values.tag);
  const releaseTag = `v${version}`;
  const release = JSON.parse(
    capture('gh', [
      'release',
      'view',
      releaseTag,
      '--repo',
      repository,
      '--json',
      'isDraft,tagName,assets',
    ]),
  );
  if (release.isDraft || release.tagName !== releaseTag)
    throw new Error(
      'Publish the reviewed GitHub release before publishing to npm.',
    );
  const commit = JSON.parse(
    capture('gh', ['api', `repos/${repository}/commits/${releaseTag}`]),
  ).sha;
  const packages = await readPackages(commit);
  const expectedAssets = new Set([
    'release-manifest.json',
    'SHA256SUMS',
    ...packages.map(
      (item) =>
        `${item.name.replace('@', '').replace('/', '-')}-${version}.tgz`,
    ),
  ]);
  if (
    release.assets.length !== expectedAssets.size ||
    release.assets.some((item) => !expectedAssets.delete(item.name))
  )
    throw new Error(
      'The GitHub release must contain exactly the expected package archives, manifest and checksums.',
    );
  await mkdir('.cache', { recursive: true });
  const destination = await mkdtemp(resolve('.cache/npm-release-'));
  capture('gh', [
    'release',
    'download',
    releaseTag,
    '--repo',
    repository,
    '--dir',
    destination,
    '--pattern',
    '*.tgz',
    '--pattern',
    'SHA256SUMS',
    '--pattern',
    'release-manifest.json',
  ]);
  const manifest = JSON.parse(
    await readFile(resolve(destination, 'release-manifest.json'), 'utf8'),
  );
  const artifacts = await verifyReleaseArtifacts(
    destination,
    manifest,
    packages,
    version,
    commit,
  );
  const registry = 'https://registry.npmjs.org';
  async function inspect(artifact) {
    const response = await globalThis.fetch(
      `${registry}/${encodeURIComponent(artifact.name)}`,
      { signal: globalThis.AbortSignal.timeout(30000) },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `npm registry lookup failed with HTTP ${response.status}.`,
      );
    const document = await response.json();
    const taggedVersion = document['dist-tags']?.[tag];
    if (taggedVersion && gt(taggedVersion, artifact.version))
      throw new Error(
        `Distribution tag ${tag} already points to a newer version of ${artifact.name}.`,
      );
    const metadata = document.versions?.[artifact.version];
    return metadata
      ? {
          name: metadata.name,
          version: metadata.version,
          integrity: metadata.dist?.integrity,
          tagVersion: document['dist-tags']?.[tag],
        }
      : null;
  }
  await publishReleaseArtifacts(artifacts, {
    inspect,
    tag,
    publish: async (artifact) => {
      run('npm', [
        'publish',
        artifact.path,
        '--access',
        'public',
        '--provenance',
        '--tag',
        tag,
        '--registry',
        registry,
      ]);
    },
    onStatus: (artifact, status) =>
      console.log(`${artifact.name}@${artifact.version}: ${status}`),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  publishCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
