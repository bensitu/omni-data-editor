import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const packages = new Map();
for (const directory of await readdir('packages')) {
  const metadata = JSON.parse(
    await readFile(`packages/${directory}/package.json`, 'utf8'),
  );
  packages.set(metadata.name, { directory, ...metadata });
}
const visiting = new Set();
const visited = new Set();
function visit(name) {
  assert(!visiting.has(name), `Dependency cycle: ${name}`);
  if (visited.has(name)) return;
  visiting.add(name);
  const item = packages.get(name);
  for (const dependency of Object.keys(item.dependencies ?? {})) {
    if (!packages.has(dependency)) continue;
    const target = packages.get(dependency).directory;
    const allowed =
      item.directory === 'editor' ||
      target === 'core' ||
      (target === 'dom' && item.directory !== 'core');
    assert(allowed, `Invalid dependency: ${name} -> ${dependency}`);
    assert(!item.directory.startsWith('host-') || !target.startsWith('host-'));
    visit(dependency);
  }
  visiting.delete(name);
  visited.add(name);
}
for (const [name, item] of packages) {
  visit(name);
  assert.equal(item.type, 'module');
  assert.equal(item.license, 'MIT');
  assert(!JSON.stringify(item.exports).includes('require'));
}
const config = JSON.parse(await readFile('.changeset/config.json', 'utf8'));
assert.equal(config.linked.length, 0);
assert.equal(
  Object.keys(packages.get('@omnidataeditor/core').dependencies ?? {}).length,
  0,
);
const publicNames = [...packages]
  .filter(([, item]) => !item.private)
  .map(([name]) => name)
  .sort();
assert.deepEqual(config.fixed.flat().sort(), publicNames);
assert.equal(
  new Set(publicNames.map((name) => packages.get(name).version)).size,
  publicNames.length ? 1 : 0,
);
async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? sources(`${directory}/${entry.name}`)
          : [`${directory}/${entry.name}`],
      ),
    )
  ).flat();
}
for (const file of await sources('packages/core/src')) {
  const source = await readFile(file, 'utf8');
  assert(
    !/\b(?:HTMLElement|document|window|customElements)\b/.test(source),
    `Browser reference: ${file}`,
  );
  assert(
    !/from ['"](?:@omnidataeditor\/|datatables|tabulator|react|vue)/.test(
      source,
    ),
    `Outer dependency: ${file}`,
  );
}
for (const [name, item] of packages) {
  if (item.directory === 'theme-default') continue;
  for (const file of await sources(`packages/${item.directory}/src`)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(
      /(?:from\s*|import\s*\()\s*['"](@omnidataeditor\/[^'"]+)['"]/g,
    )) {
      const dependency = match[1];
      assert(
        packages.has(dependency),
        `Unsupported package entry: ${file}: ${dependency}`,
      );
      assert(
        item.dependencies?.[dependency],
        `Undeclared dependency: ${name} -> ${dependency}`,
      );
    }
    assert(
      !/from\s*['"][^'"]*(?:test-kit|\/test\/)/.test(source),
      `Test dependency in ${file}`,
    );
  }
}
const coreConfig = JSON.parse(
  await readFile('packages/core/tsconfig.json', 'utf8'),
);
assert(
  !coreConfig.compilerOptions.lib.some((value) =>
    value.toLowerCase().includes('dom'),
  ),
);
for (const file of await sources('examples')) {
  if (!file.endsWith('.ts')) continue;
  const source = await readFile(file, 'utf8');
  assert(
    !/from\s*['"][^'"]*packages\/[^'"]*\/src\//.test(source),
    `Source import in ${file}`,
  );
}
console.log(
  `Package dependencies and metadata verified for ${packages.size} packages.`,
);
