import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gt, prerelease } from 'semver';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from './process.mjs';
import {
  capture,
  readPackages,
  releaseVersion,
  repository,
  requireReleaseWorkflow,
  validateReleaseTag,
  verifyReleaseArtifacts,
} from './release-utils.mjs';

const registry = 'https://registry.npmjs.org';

export function resolvePublicationTarget(input, tag = 'auto') {
  const version = releaseVersion(input);
  if (tag === 'auto') {
    const identifiers = prerelease(version);
    const channel = String(identifiers?.[0]);
    tag = identifiers
      ? ['alpha', 'beta', 'rc'].includes(channel)
        ? channel
        : 'next'
      : 'latest';
  }
  return validateReleaseTag(version, tag);
}

export async function inspectPublishedArtifact(artifact, tag) {
  const name = encodeURIComponent(artifact.name);
  const [versionResponse, tagsResponse] = await Promise.all(
    [
      `${registry}/${name}/${encodeURIComponent(artifact.version)}`,
      `${registry}/-/package/${name}/dist-tags`,
    ].map((url) =>
      globalThis.fetch(url, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: globalThis.AbortSignal.timeout(30000),
      }),
    ),
  );
  if (!versionResponse.ok && versionResponse.status !== 404)
    throw new Error(
      `npm version lookup failed with HTTP ${versionResponse.status}.`,
    );
  // Unpublished packages can return 401 from the distribution-tag endpoint.
  if (
    !tagsResponse.ok &&
    tagsResponse.status !== 404 &&
    !(versionResponse.status === 404 && tagsResponse.status === 401)
  )
    throw new Error(
      `npm distribution-tag lookup failed with HTTP ${tagsResponse.status}.`,
    );
  const tags = tagsResponse.ok ? await tagsResponse.json() : {};
  const taggedVersion = tags[tag];
  if (taggedVersion && gt(taggedVersion, artifact.version))
    throw new Error(
      `Distribution tag ${tag} already points to a newer version of ${artifact.name}.`,
    );
  if (versionResponse.status === 404) return null;
  const metadata = await versionResponse.json();
  return {
    name: metadata.name,
    version: metadata.version,
    integrity: metadata.dist?.integrity,
    tagVersion: taggedVersion,
  };
}

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
  {
    inspect,
    publish,
    setTag,
    tag,
    wait = delay,
    attempts = 61,
    onStatus = () => {},
  },
) {
  if (
    !artifacts.length ||
    new Set(artifacts.map((item) => item.name)).size !== artifacts.length
  )
    throw new Error('Release packages must be nonempty and unique.');
  const existing = await Promise.all(artifacts.map(inspect));
  existing.forEach((metadata, index) => {
    if (metadata) verifyPublishedArtifact(artifacts[index], metadata);
  });
  for (let index = 0; index < artifacts.length; index++) {
    const artifact = artifacts[index];
    if (existing[index]) {
      onStatus(artifact, 'archive already matches');
      if (existing[index].tagVersion !== artifact.version && setTag)
        await setTag(artifact, tag);
    } else {
      await publish(artifact);
      onStatus(artifact, 'submitted');
    }
  }
  let pending = [...artifacts];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const metadata = await Promise.all(pending.map(inspect));
    pending = pending.filter((artifact, index) => {
      if (!metadata[index]) return true;
      verifyPublishedArtifact(artifact, metadata[index]);
      if (metadata[index].tagVersion !== artifact.version) return true;
      onStatus(artifact, 'verified');
      return false;
    });
    if (!pending.length) return;
    if (attempt % 6 === 0)
      for (const artifact of pending)
        onStatus(artifact, 'waiting for npm registry processing');
    if (attempt + 1 < attempts) await wait(10000);
  }
  throw new Error(
    `npm registry processing has not completed for: ${pending.map((item) => `${item.name}@${item.version}`).join(', ')}. Retry the same release after these versions become available.`,
  );
}

async function publishCli() {
  requireReleaseWorkflow({ allowTag: true });
  const { values } = parseArgs({
    options: { version: { type: 'string' }, tag: { type: 'string' } },
  });
  const { version, tag } = resolvePublicationTarget(values.version, values.tag);
  const releaseTag = `v${version}`;
  if (process.env.GITHUB_REF !== `refs/tags/${releaseTag}`)
    throw new Error(
      'Select the matching release tag when starting publication.',
    );
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
  if (process.env.GITHUB_SHA !== commit)
    throw new Error(
      'Publication must run from the exact release source commit.',
    );
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
  for (const artifact of artifacts)
    capture('gh', [
      'attestation',
      'verify',
      artifact.path,
      '--repo',
      repository,
      '--signer-workflow',
      `${repository}/.github/workflows/draft-release.yml`,
      '--source-digest',
      commit,
      '--deny-self-hosted-runners',
    ]);
  await publishReleaseArtifacts(artifacts, {
    inspect: (artifact) => inspectPublishedArtifact(artifact, tag),
    tag,
    setTag: async (artifact) => {
      run('npm', [
        'dist-tag',
        'add',
        `${artifact.name}@${artifact.version}`,
        tag,
        '--registry',
        registry,
      ]);
    },
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
