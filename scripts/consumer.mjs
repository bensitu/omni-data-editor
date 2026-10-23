import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  copyFile,
} from 'node:fs/promises';
import { run } from './process.mjs';
import { resolve } from 'node:path';
import webpack from 'webpack';
const target = resolve('.cache/consumer');
await mkdir(target, { recursive: true });
const dependencies = {};
for (const directory of await readdir('packages')) {
  const metadata = JSON.parse(
    await readFile(`packages/${directory}/package.json`, 'utf8'),
  );
  run('pnpm', [
    '--dir',
    `packages/${directory}`,
    'pack',
    '--pack-destination',
    target,
  ]);
  const file = `${metadata.name.replace('@', '').replace('/', '-')}-${metadata.version}.tgz`;
  dependencies[metadata.name] = `file:./${file}`;
}
await writeFile(
  `${target}/package.json`,
  JSON.stringify({ private: true, type: 'module', dependencies }),
);
await writeFile(
  `${target}/pnpm-workspace.yaml`,
  'packages: []\noverrides:\n' +
    Object.entries(dependencies)
      .map(([name, path]) => `  "${name}": "${path}"`)
      .join('\n') +
    '\n',
);
for (const name of ['contracts.ts', 'node.mjs', 'main.ts', 'index.html'])
  await copyFile(`tests/consumer-smoke/${name}`, `${target}/${name}`);
run('pnpm', ['install', '--force', '--ignore-scripts'], target);
run('pnpm', [
  'exec',
  'tsc',
  '--ignoreConfig',
  '--noEmit',
  '--strict',
  '--target',
  'ES2022',
  '--module',
  'NodeNext',
  '--moduleResolution',
  'NodeNext',
  '--types',
  'node',
  `${target}/contracts.ts`,
]);
run('node', [`${target}/node.mjs`]);
for (const name of Object.keys(dependencies).filter(
  (name) => name !== '@omnidataeditor/theme-default',
))
  run(
    'node',
    ['--input-type=module', '-e', `await import('${name}');`],
    target,
  );
const { build, createServer } = await import('vite');
await build({
  root: target,
  configFile: false,
  build: { outDir: 'vite-dist' },
});
const server = await createServer({
  root: target,
  configFile: false,
  server: { middlewareMode: true },
});
try {
  await server.ssrLoadModule('/node.mjs');
} finally {
  await server.close();
}
await copyFile(`${target}/main.ts`, `${target}/main.mjs`);
await new Promise((resolveBuild, reject) =>
  webpack(
    {
      mode: 'production',
      context: target,
      entry: './main.mjs',
      output: {
        path: `${target}/webpack-dist`,
        filename: 'index.js',
        module: true,
      },
      experiments: { outputModule: true, css: true },
    },
    (error, stats) => {
      if (error || stats?.hasErrors())
        reject(
          error ?? new Error(stats.toString({ all: false, errors: true })),
        );
      else resolveBuild();
    },
  ),
);
await mkdir(`${target}/app`, { recursive: true });
for (const name of ['page.js', 'layout.js'])
  await copyFile(
    `tests/consumer-smoke/next-ssr-import/app/${name}`,
    `${target}/app/${name}`,
  );
await writeFile(
  `${target}/next.config.mjs`,
  `export default { outputFileTracingRoot: ${JSON.stringify(target)}, experimental: { cpus: 2 } };\n`,
);
run('pnpm', ['exec', 'next', 'build', '--webpack', target]);
console.log(
  'Packed consumer compilation, Node, Vite, Webpack and Next server builds passed.',
);
