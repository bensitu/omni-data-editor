import { expect, it, vi } from 'vitest';
import {
  publishReleaseArtifacts,
  resolvePublicationTarget,
} from '../../scripts/publish-release-artifacts.mjs';

it.each([
  ['v0.1.2', '0.1.2', 'latest'],
  ['0.2.0-alpha.1', '0.2.0-alpha.1', 'alpha'],
  ['0.2.0-beta.1', '0.2.0-beta.1', 'beta'],
  ['v0.2.0-rc.1', '0.2.0-rc.1', 'rc'],
  ['0.2.0-preview.1', '0.2.0-preview.1', 'next'],
])('selects the publication channel for %s', (input, version, tag) => {
  expect(resolvePublicationTarget(input)).toEqual({ version, tag });
  expect(resolvePublicationTarget(input, 'auto')).toEqual({ version, tag });
});

it('validates explicit publication channels for manual retries', () => {
  expect(resolvePublicationTarget('0.2.0-rc.1', 'next')).toEqual({
    version: '0.2.0-rc.1',
    tag: 'next',
  });
  expect(() => resolvePublicationTarget('0.2.0-beta.1', 'latest')).toThrow(
    /requires one of these distribution tags/,
  );
  expect(() => resolvePublicationTarget('invalid')).toThrow(/semantic version/);
});

it('repairs an existing matching distribution tag without publishing the archive again', async () => {
  const artifact = {
    name: '@example/package',
    version: '0.1.1',
    integrity: 'sha512-example',
  };
  let metadata = { ...artifact, tagVersion: '0.1.0' };
  const publish = vi.fn();
  const setTag = vi.fn(async () => {
    metadata = { ...metadata, tagVersion: artifact.version };
  });
  const inspect = async () => metadata;
  await publishReleaseArtifacts([artifact], {
    inspect,
    publish,
    setTag,
    tag: 'latest',
    attempts: 1,
  });
  expect(publish).not.toHaveBeenCalled();
  expect(setTag).toHaveBeenCalledWith(artifact, 'latest');
  metadata = { ...metadata, integrity: 'sha512-different' };
  await expect(
    publishReleaseArtifacts([artifact], {
      inspect,
      publish,
      setTag,
      tag: 'latest',
      attempts: 1,
    }),
  ).rejects.toThrow(/does not match/);
  expect(setTag).toHaveBeenCalledTimes(1);
});
