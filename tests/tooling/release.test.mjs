import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  orderPackages,
  releaseVersion,
  validateReleaseTag,
  integrity,
  sha256,
  repository,
  repositoryUrl,
  verifyReleaseArtifacts,
} from '../../scripts/release-utils.mjs';
import { publishReleaseArtifacts } from '../../scripts/publish-release-artifacts.mjs';
import { run } from '../../scripts/process.mjs';

test('validates complete versions and distribution tags', () => {
  assert.equal(releaseVersion('v0.1.0'), '0.1.0');
  assert.equal(validateReleaseTag('0.1.0', 'latest').tag, 'latest');
  assert.equal(validateReleaseTag('0.2.0-rc.1', 'next').version, '0.2.0-rc.1');
  assert.equal(validateReleaseTag('0.2.0-beta.1', 'beta').tag, 'beta');
  for (const version of [
    '0.1',
    '01.0.0',
    '0.1.0-alpha.01',
    '0.1.0+build',
    '0.1.0\nmalformed',
  ])
    assert.throws(() => releaseVersion(version));
  for (const [version, tag] of [
    ['0.2.0-alpha.1', 'latest'],
    ['0.2.0-beta.1', 'next'],
    ['0.1.0', 'v1'],
    ['0.1.0', '--latest'],
  ])
    assert.throws(() => validateReleaseTag(version, tag));
});

test('orders packages before their dependents and rejects cycles', () => {
  const packages = [
    { name: 'editor', dependencies: { dom: '*' } },
    { name: 'core' },
    { name: 'dom', dependencies: { core: '*' } },
  ];
  assert.deepEqual(
    orderPackages(packages).map((item) => item.name),
    ['core', 'dom', 'editor'],
  );
  assert.throws(
    () =>
      orderPackages([
        { name: 'a', dependencies: { b: '*' } },
        { name: 'b', dependencies: { a: '*' } },
      ]),
    /cycle/,
  );
  assert.throws(() => orderPackages([{ name: 'a' }, { name: 'a' }]), /unique/);
});

async function artifactFixture(action) {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'release-test-'));
  try {
    const metadata = {
      name: '@omnidataeditor/core',
      version: '0.1.0',
      directory: 'core',
      repository: {
        type: 'git',
        url: repositoryUrl,
        directory: 'packages/core',
      },
      publishConfig: { access: 'public', provenance: true },
    };
    const source = join(directory, 'source');
    await mkdir(join(source, 'package'), { recursive: true });
    await writeFile(
      join(source, 'package', 'package.json'),
      JSON.stringify(metadata),
    );
    const filename = 'omnidataeditor-core-0.1.0.tgz';
    const path = join(directory, filename);
    run('tar', ['-czf', path, '-C', source, 'package'], undefined, {
      stdio: 'pipe',
    });
    const bytes = await readFile(path);
    const artifact = {
      name: metadata.name,
      version: metadata.version,
      filename,
      sha256: sha256(bytes),
      integrity: integrity(bytes),
    };
    const manifest = {
      schemaVersion: 1,
      repository,
      version: '0.1.0',
      commit: 'a'.repeat(40),
      artifacts: [artifact],
    };
    await writeFile(
      join(directory, 'SHA256SUMS'),
      `${artifact.sha256}  ${filename}\n`,
    );
    await action({ directory, metadata, artifact, manifest, path });
  } finally {
    if (dirname(directory) === cache)
      await rm(directory, { recursive: true, force: true });
  }
}

test('checks archive identity, source commit, package completeness and checksums', async () => {
  await artifactFixture(
    async ({ directory, metadata, artifact, manifest, path }) => {
      const packages = [metadata];
      assert.equal(
        (
          await verifyReleaseArtifacts(
            directory,
            manifest,
            packages,
            '0.1.0',
            'a'.repeat(40),
          )
        )[0].path,
        path,
      );
      await assert.rejects(
        verifyReleaseArtifacts(
          directory,
          manifest,
          packages,
          '0.1.0',
          'b'.repeat(40),
        ),
        /source/,
      );
      await assert.rejects(
        verifyReleaseArtifacts(
          directory,
          { ...manifest, artifacts: [] },
          packages,
          '0.1.0',
        ),
        /every public package/,
      );
      await assert.rejects(
        verifyReleaseArtifacts(
          directory,
          {
            ...manifest,
            artifacts: [{ ...artifact, filename: '../package.tgz' }],
          },
          packages,
          '0.1.0',
        ),
        /Unexpected/,
      );
      await writeFile(join(directory, 'SHA256SUMS'), 'incorrect\n');
      await assert.rejects(
        verifyReleaseArtifacts(directory, manifest, packages, '0.1.0'),
        /checksum list/,
      );
      await writeFile(
        join(directory, 'SHA256SUMS'),
        `${artifact.sha256}  ${artifact.filename}\n`,
      );
      await writeFile(path, 'damaged archive');
      await assert.rejects(
        verifyReleaseArtifacts(directory, manifest, packages, '0.1.0'),
        /checksum mismatch/,
      );
    },
  );
});

const artifacts = [
  { name: '@omnidataeditor/core', version: '0.1.0', integrity: 'sha512-core' },
  { name: '@omnidataeditor/dom', version: '0.1.0', integrity: 'sha512-dom' },
];
const publishedMetadata = (artifact) => ({
  ...artifact,
  tagVersion: artifact.version,
});

test('rejects conflicting published bytes or tags before publishing any package', async () => {
  for (const conflict of [
    { integrity: 'different' },
    { tagVersion: '0.2.0' },
  ]) {
    const published = [];
    await assert.rejects(
      publishReleaseArtifacts(artifacts, {
        tag: 'latest',
        inspect: async (artifact) =>
          artifact === artifacts[1]
            ? { ...publishedMetadata(artifact), ...conflict }
            : null,
        publish: async (artifact) => {
          published.push(artifact.name);
        },
      }),
      /does not match|does not point/,
    );
    assert.deepEqual(published, []);
  }
});

test('resumes a partial publication and tolerates registry propagation delay', async () => {
  const published = [],
    statuses = [],
    stored = new Map([[artifacts[0].name, publishedMetadata(artifacts[0])]]);
  let remainingDelay = 1;
  await publishReleaseArtifacts(artifacts, {
    tag: 'latest',
    attempts: 3,
    wait: async () => {},
    inspect: async (artifact) =>
      artifact === artifacts[1] &&
      stored.has(artifact.name) &&
      remainingDelay-- > 0
        ? null
        : (stored.get(artifact.name) ?? null),
    publish: async (artifact) => {
      published.push(artifact.name);
      stored.set(artifact.name, publishedMetadata(artifact));
    },
    onStatus: (artifact, status) => statuses.push([artifact.name, status]),
  });
  assert.deepEqual(published, [artifacts[1].name]);
  assert.deepEqual(
    statuses.map((item) => item[1]),
    ['already verified', 'published'],
  );
});

test('a lost publication response can be retried without republishing committed bytes', async () => {
  const stored = new Map(),
    published = [];
  let loseResponse = true;
  const options = {
    tag: 'latest',
    wait: async () => {},
    inspect: async (artifact) => stored.get(artifact.name) ?? null,
    publish: async (artifact) => {
      published.push(artifact.name);
      stored.set(artifact.name, publishedMetadata(artifact));
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Response lost');
      }
    },
  };
  await assert.rejects(
    publishReleaseArtifacts(artifacts, options),
    /Response lost/,
  );
  await publishReleaseArtifacts(artifacts, options);
  assert.deepEqual(
    published,
    artifacts.map((artifact) => artifact.name),
  );
});

test('registry failures and unavailable published bytes stop the remaining publication', async () => {
  const published = [];
  await assert.rejects(
    publishReleaseArtifacts(artifacts, {
      tag: 'latest',
      inspect: async () => {
        throw new Error('Registry unavailable');
      },
      publish: async (artifact) => {
        published.push(artifact.name);
      },
    }),
    /Registry unavailable/,
  );
  assert.deepEqual(published, []);
  await assert.rejects(
    publishReleaseArtifacts(artifacts, {
      tag: 'latest',
      attempts: 2,
      wait: async () => {},
      inspect: async () => null,
      publish: async (artifact) => {
        published.push(artifact.name);
      },
    }),
    /not available/,
  );
  assert.deepEqual(published, [artifacts[0].name]);
});
