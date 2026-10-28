import { expect, it, vi } from 'vitest';
import { publishReleaseArtifacts } from '../../scripts/publish-release-artifacts.mjs';

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
