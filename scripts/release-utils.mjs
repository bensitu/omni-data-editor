import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { valid, validRange, prerelease } from 'semver';
import spawn from 'cross-spawn';

export const repository = 'bensitu/omni-data-editor';
export const repositoryUrl = `git+https://github.com/${repository}.git`;

export function capture(command, args) {
  const result = spawn.sync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr.trim() || `exit ${result.status ?? result.signal}`}`,
    );
  return result.stdout.trim();
}

export function releaseVersion(input) {
  const version = String(input ?? '').replace(/^v/, '');
  if (!valid(version) || valid(version) !== version)
    throw new Error('Use a complete semantic version without build metadata.');
  return version;
}

export function releaseNotes({ version: input, changelog }) {
  const version = releaseVersion(input);
  const source = changelog.replace(/\r\n/g, '\n');
  const headings = [
    ...source.matchAll(
      /^## \[([^\]\n]+)\](?: - (\d{4}-\d{2}-\d{2}))?[ \t]*$/gm,
    ),
  ];
  const matches = headings.filter((heading) => heading[1] === version);
  if (matches.length !== 1 || !matches[0][2])
    throw new Error(
      `Project changelog must contain one dated entry for ${version}.`,
    );
  const heading = matches[0];
  const next = headings[headings.indexOf(heading) + 1];
  const section = source.slice(heading.index + heading[0].length, next?.index);
  const references = [...source.matchAll(/^\[[^\]\n]+\]:[^\n]+$/gm)]
    .map((match) => match[0])
    .join('\n');
  const body = section.replace(/^\[[^\]\n]+\]:[^\n]+$/gm, '').trim();
  if (!body)
    throw new Error(`Project changelog has no release notes for ${version}.`);
  return `# v${version}\n\n${body}\n${references ? `\n${references}\n` : ''}`;
}

export function validateReleaseTag(input, tag) {
  const version = releaseVersion(input);
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(tag ?? '') || validRange(tag))
    throw new Error('Use a valid npm distribution tag.');
  const identifiers = prerelease(version);
  if (identifiers) {
    const channel = String(identifiers[0]);
    const allowed =
      channel === 'rc'
        ? ['rc', 'next']
        : ['alpha', 'beta'].includes(channel)
          ? [channel]
          : ['next'];
    if (!allowed.includes(tag))
      throw new Error(
        `Version ${version} requires one of these distribution tags: ${allowed.join(', ')}.`,
      );
  }
  return { version, tag };
}

export function orderPackages(packages) {
  const byName = new Map(packages.map((item) => [item.name, item]));
  if (byName.size !== packages.length)
    throw new Error('Package names must be unique.');
  const ordered = [],
    active = new Set(),
    complete = new Set();
  function visit(item) {
    if (active.has(item.name))
      throw new Error('Release packages contain a dependency cycle.');
    if (complete.has(item.name)) return;
    active.add(item.name);
    for (const name of Object.keys(item.dependencies ?? {}).sort()) {
      if (byName.has(name)) visit(byName.get(name));
    }
    active.delete(item.name);
    complete.add(item.name);
    ordered.push(item);
  }
  for (const item of [...packages].sort((a, b) => a.name.localeCompare(b.name)))
    visit(item);
  return ordered;
}

export async function readPackages(ref) {
  if (ref && !/^[a-f0-9]{40}$/.test(ref))
    throw new Error('Use a complete source commit identifier.');
  const directories = ref
    ? capture('git', ['ls-tree', '--name-only', `${ref}:packages`]).split('\n')
    : await readdir('packages');
  const packages = [];
  for (const directory of directories) {
    if (!/^[a-z0-9-]+$/.test(directory))
      throw new Error('Invalid package directory.');
    const path = `packages/${directory}/package.json`;
    const metadata = JSON.parse(
      ref
        ? capture('git', ['show', `${ref}:${path}`])
        : await readFile(path, 'utf8'),
    );
    if (!metadata.private) packages.push({ ...metadata, directory });
  }
  if (!packages.length)
    throw new Error('No public release packages were found.');
  return orderPackages(packages);
}

export function validatePackages(packages, input) {
  const version = releaseVersion(input ?? packages[0]?.version);
  for (const item of packages) {
    if (item.version !== version)
      throw new Error(`Package version differs from ${version}: ${item.name}.`);
    if (
      item.repository?.url !== repositoryUrl ||
      item.repository.directory !== `packages/${item.directory}`
    )
      throw new Error(
        `Configure the public repository and package directory for ${item.name}.`,
      );
    if (
      item.publishConfig?.access !== 'public' ||
      item.publishConfig.provenance !== true
    )
      throw new Error(
        `Configure public publication and provenance for ${item.name}.`,
      );
  }
  return version;
}

export function requireReleaseWorkflow() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_REPOSITORY !== repository
  )
    throw new Error(
      'Run this operation through the manual release workflow on main.',
    );
}

export const archiveName = (item) =>
  `${item.name.replace('@', '').replace('/', '-')}-${item.version}.tgz`;
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const integrity = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

export async function verifyReleaseArtifacts(
  directory,
  manifest,
  packages,
  input,
  sourceCommit,
) {
  const version = validatePackages(packages, input);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.repository !== repository ||
    manifest.version !== version ||
    !/^[a-f0-9]{40}$/.test(manifest.commit ?? '') ||
    (sourceCommit && manifest.commit !== sourceCommit)
  )
    throw new Error(
      'The release manifest does not match the requested source and version.',
    );
  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== packages.length
  )
    throw new Error(
      'The release must contain every public package exactly once.',
    );
  const expected = new Map(packages.map((item) => [item.name, item]));
  const result = [];
  for (const artifact of manifest.artifacts) {
    const item = expected.get(artifact.name);
    if (
      !item ||
      artifact.version !== version ||
      artifact.filename !== archiveName(item) ||
      basename(artifact.filename) !== artifact.filename
    )
      throw new Error('Unexpected or duplicate release artifact.');
    expected.delete(artifact.name);
    const path = resolve(directory, artifact.filename);
    const bytes = await readFile(path);
    if (
      sha256(bytes) !== artifact.sha256 ||
      integrity(bytes) !== artifact.integrity
    )
      throw new Error(`Release artifact checksum mismatch: ${artifact.name}.`);
    const metadata = JSON.parse(
      capture('tar', ['-xOf', path, 'package/package.json']),
    );
    validatePackages([{ ...metadata, directory: item.directory }], version);
    if (
      metadata.name !== artifact.name ||
      JSON.stringify(metadata).includes('workspace:')
    )
      throw new Error(`Release package metadata mismatch: ${artifact.name}.`);
    result.push({ ...artifact, path });
  }
  const checksums = await readFile(resolve(directory, 'SHA256SUMS'), 'utf8');
  const expectedChecksums =
    manifest.artifacts
      .map((item) => `${item.sha256}  ${item.filename}`)
      .sort()
      .join('\n') + '\n';
  if (checksums !== expectedChecksums)
    throw new Error('The checksum list does not match the release manifest.');
  const names = new Set(manifest.artifacts.map((item) => item.filename));
  const tarballs = (await readdir(directory)).filter((name) =>
    name.endsWith('.tgz'),
  );
  if (
    tarballs.length !== names.size ||
    tarballs.some((name) => !names.has(name))
  )
    throw new Error(
      'The release directory contains unexpected package archives.',
    );
  const byName = new Map(result.map((item) => [item.name, item]));
  return packages.map((item) => byName.get(item.name));
}
